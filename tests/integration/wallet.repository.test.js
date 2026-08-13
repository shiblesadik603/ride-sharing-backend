import { describe, it, expect, afterAll } from "@jest/globals";
import { prisma } from "../../src/config/database.js";
import * as walletRepository from "../../src/repositories/wallet.repository.js";
import { createTestPassenger, deleteTestUser } from "../helpers/factories.js";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("wallet.repository.tryDebit (integration, real Postgres)", () => {
  it("succeeds and decrements balance when funds are sufficient", async () => {
    const user = await createTestPassenger();
    await walletRepository.credit(user.wallet.id, 100);

    const result = await walletRepository.tryDebit(user.wallet.id, 40);
    const wallet = await walletRepository.findByUserId(user.id);

    expect(result.count).toBe(1);
    expect(Number(wallet.balance)).toBe(60);

    await deleteTestUser(user.id);
  });

  it("fails (count 0) and leaves balance untouched when funds are insufficient", async () => {
    const user = await createTestPassenger();
    await walletRepository.credit(user.wallet.id, 10);

    const result = await walletRepository.tryDebit(user.wallet.id, 50);
    const wallet = await walletRepository.findByUserId(user.id);

    expect(result.count).toBe(0);
    expect(Number(wallet.balance)).toBe(10); // unchanged, not partially debited

    await deleteTestUser(user.id);
  });

  /**
   * The test that actually matters: prove the overdraft guard holds under
   * genuine concurrent access, not just sequential calls. A balance of 60
   * can cover exactly one of two racing 40-unit debits — if the guard were
   * a naive "read balance, check, then write" instead of the atomic
   * conditional UPDATE it actually is, both requests could read 60 before
   * either writes, and both would incorrectly succeed.
   */
  it("allows only one of two concurrent debits to succeed when funds can't cover both", async () => {
    const user = await createTestPassenger();
    await walletRepository.credit(user.wallet.id, 60);

    const [first, second] = await Promise.all([
      walletRepository.tryDebit(user.wallet.id, 40),
      walletRepository.tryDebit(user.wallet.id, 40),
    ]);

    const successCount = [first, second].filter((r) => r.count === 1).length;
    const wallet = await walletRepository.findByUserId(user.id);

    expect(successCount).toBe(1);
    expect(Number(wallet.balance)).toBe(20); // 60 - exactly one 40, never negative

    await deleteTestUser(user.id);
  });
});
