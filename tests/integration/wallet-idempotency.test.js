import { describe, it, expect, afterAll } from "@jest/globals";
import crypto from "node:crypto";
import { prisma } from "../../src/config/database.js";
import * as walletService from "../../src/services/wallet.service.js";
import * as walletRepository from "../../src/repositories/wallet.repository.js";
import { createTestPassenger, deleteTestUser } from "../helpers/factories.js";
import { closeAppConnections } from "../helpers/teardown.js";

// wallet.service.js doesn't currently import Redis/metrics/queues, so
// prisma.$disconnect() alone would technically suffice here — but using
// the same shared closeAppConnections as every other integration test in
// this session means a future change that *does* add a metrics counter or
// a Redis call to wallet.service.js can't silently reintroduce the exact
// open-handle bug ride-expiry.test.js and driver-location-plausibility.
// test.js both hit (see their own comments for how that was found).
afterAll(closeAppConnections);

/**
 * Covers the single most severe gap found in the production-hardening
 * audit: a redelivered Stripe webhook (network retry, at-least-once
 * delivery — not hypothetical, Stripe genuinely does this) used to
 * double-credit a wallet on every replay, with no guard at all. Fixed via
 * a DB-level unique constraint (walletId, reason, referenceId) plus a
 * P2002-as-no-op catch in confirmTopUp. This test simulates the exact
 * replay scenario directly against real Postgres, not a mock.
 */
describe("wallet.service.confirmTopUp idempotency (integration, real Postgres)", () => {
  it("crediting the same Stripe PaymentIntent twice only credits the wallet once", async () => {
    const passenger = await createTestPassenger();
    const paymentIntentId = `pi_test_${crypto.randomUUID()}`;

    // Simulates Stripe redelivering the same payment_intent.succeeded
    // event — same amount, same intent id, both calls racing/duplicating
    // exactly like a real webhook retry would.
    await walletService.confirmTopUp(passenger.id, 2500, paymentIntentId); // $25.00 in cents
    await walletService.confirmTopUp(passenger.id, 2500, paymentIntentId); // redelivery

    const wallet = await walletRepository.findByUserId(passenger.id);
    expect(Number(wallet.balance)).toBe(25);

    const transactions = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id, reason: "TOPUP", referenceId: paymentIntentId },
    });
    expect(transactions).toHaveLength(1);

    await deleteTestUser(passenger.id);
  });

  it("two different top-ups for the same user both land (different referenceId)", async () => {
    const passenger = await createTestPassenger();

    await walletService.confirmTopUp(passenger.id, 1000, `pi_test_${crypto.randomUUID()}`);
    await walletService.confirmTopUp(passenger.id, 500, `pi_test_${crypto.randomUUID()}`);

    const wallet = await walletRepository.findByUserId(passenger.id);
    expect(Number(wallet.balance)).toBe(15);

    await deleteTestUser(passenger.id);
  });

  it("two partial refunds on the same payment both credit (distinct referenceId per refund)", async () => {
    // Regression test for a bug caught while building the fix itself:
    // an earlier version of this fix used the shared paymentId as the
    // wallet ledger's referenceId for every refund, which collided with
    // the new unique constraint the moment a payment got a *second*
    // partial refund. creditRefund is keyed by each Refund row's own id
    // instead, specifically so this stays possible.
    const passenger = await createTestPassenger();
    const wallet = await walletRepository.findByUserId(passenger.id);

    await walletService.creditRefund(passenger.id, 5, "refund-id-1");
    await walletService.creditRefund(passenger.id, 12.36, "refund-id-2");

    const updated = await walletRepository.findByUserId(passenger.id);
    expect(Number(updated.balance)).toBeCloseTo(17.36, 2);

    const transactions = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id, reason: "REFUND" },
    });
    expect(transactions).toHaveLength(2);

    await deleteTestUser(passenger.id);
  });
});
