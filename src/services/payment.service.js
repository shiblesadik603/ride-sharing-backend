import { prisma } from "../config/database.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../utils/ApiError.js";
import { stripe } from "../config/stripe.js";
import { toStripeCents } from "../utils/money.util.js";
import * as paymentRepository from "../repositories/payment.repository.js";
import * as refundRepository from "../repositories/refund.repository.js";
import * as rideRepository from "../repositories/ride.repository.js";
import * as walletRepository from "../repositories/wallet.repository.js";
import * as couponRedemptionRepository from "../repositories/couponRedemption.repository.js";
import * as auditLogRepository from "../repositories/auditLog.repository.js";
import * as userRepository from "../repositories/user.repository.js";
import * as couponService from "./coupon.service.js";
import * as walletService from "./wallet.service.js";
import * as notificationService from "./notification.service.js";
import { paymentOutcomesTotal } from "../config/metrics.js";

/**
 * The only entry point for paying off a completed ride. `method` picks
 * the branch; `provider` (what actually gets charged) is derived from it
 * rather than trusted from the client — CARD always means STRIPE, never
 * something a request body could override.
 */
export async function payForRide(userId, rideId, { method, couponCode }) {
  const ride = await rideRepository.findById(rideId);
  if (!ride || ride.passenger.userId !== userId) {
    throw ApiError.notFound("Ride not found");
  }
  if (ride.status !== "COMPLETED") {
    throw ApiError.conflict("Only a completed ride can be paid for");
  }
  if (ride.payment) {
    throw ApiError.conflict("This ride has already been paid for");
  }

  let amount = Number(ride.actualFare);
  let discountAmount = 0;
  let couponId = null;

  if (couponCode) {
    const result = await couponService.validateCoupon(couponCode, userId, amount);
    couponId = result.coupon.id;
    discountAmount = result.discountAmount;
    amount = Number((amount - discountAmount).toFixed(2));
  }

  let payment;
  let clientSecret;

  if (method === "CASH") {
    payment = await paymentRepository.create({
      rideId: ride.id,
      payerId: userId,
      amount,
      currency: ride.currency,
      method: "CASH",
      provider: "CASH",
      status: "COMPLETED",
      paidAt: new Date(),
    });
    paymentOutcomesTotal.inc({ method: "CASH", outcome: "completed" });
  } else if (method === "WALLET") {
    const wallet = await walletRepository.findByUserId(userId);
    if (!wallet) throw ApiError.badRequest("Wallet not found");

    // Debit + ledger + payment row all have to land together — an
    // interactive transaction, not the array form, because the ledger
    // entry's balanceAfter depends on the debit's own result.
    payment = await prisma.$transaction(async (tx) => {
      const debit = await walletRepository.tryDebit(wallet.id, amount, tx);
      if (debit.count === 0) {
        throw ApiError.badRequest("Insufficient wallet balance");
      }
      const updatedWallet = await walletRepository.findByUserId(userId, tx);
      await walletRepository.createTransaction(
        {
          walletId: wallet.id,
          type: "DEBIT",
          reason: "RIDE_PAYMENT",
          amount,
          balanceAfter: updatedWallet.balance,
          referenceId: ride.id,
        },
        tx
      );
      return paymentRepository.create(
        {
          rideId: ride.id,
          payerId: userId,
          amount,
          currency: ride.currency,
          method: "WALLET",
          provider: "WALLET",
          status: "COMPLETED",
          paidAt: new Date(),
        },
        tx
      );
    });
    paymentOutcomesTotal.inc({ method: "WALLET", outcome: "completed" });
  } else {
    if (!stripe) throw ApiError.internal("Card payments are not configured on this server");

    // A ride can only ever have one Payment row (rideId is @unique), so
    // the ride's own id is a perfect, naturally-stable idempotency key: a
    // client retry after a dropped connection (the PaymentIntent actually
    // got created, but the response never arrived) hits Stripe with the
    // same key and gets back the *same* PaymentIntent instead of creating
    // a second, orphaned one with no local record pointing at it.
    const intent = await stripe.paymentIntents.create(
      {
        amount: toStripeCents(amount),
        currency: ride.currency.toLowerCase(),
        metadata: { type: "RIDE_PAYMENT", rideId: ride.id, userId },
      },
      { idempotencyKey: `ride-payment-${ride.id}` }
    );
    clientSecret = intent.client_secret;

    // If this throws (a transient DB error, a P2002 despite the
    // idempotency key somehow racing another insert), Stripe already has
    // a live PaymentIntent with no local record pointing at it — nothing
    // was charged yet (the client hasn't confirmed it), but it's still an
    // orphan Stripe would otherwise hold onto until it naturally expires.
    // Best-effort cancellation closes that gap; if the cancel *also*
    // fails, that's logged loudly rather than silently, since at that
    // point manual reconciliation in the Stripe dashboard is the only
    // remaining recovery path.
    try {
      payment = await paymentRepository.create({
        rideId: ride.id,
        payerId: userId,
        amount,
        currency: ride.currency,
        method: "CARD",
        provider: "STRIPE",
        status: "PENDING",
        stripePaymentIntentId: intent.id,
      });
    } catch (dbErr) {
      try {
        await stripe.paymentIntents.cancel(intent.id);
        logger.warn("Payment DB write failed after Stripe PaymentIntent creation — cancelled the orphaned intent", {
          rideId: ride.id,
          paymentIntentId: intent.id,
          error: dbErr.message,
        });
      } catch (cancelErr) {
        logger.error(
          "Payment DB write failed AND compensating Stripe cancellation also failed — orphaned PaymentIntent needs manual reconciliation",
          { rideId: ride.id, paymentIntentId: intent.id, dbError: dbErr.message, cancelError: cancelErr.message }
        );
      }
      throw dbErr;
    }
  }

  if (couponId) {
    await couponRedemptionRepository.create({
      couponId,
      userId,
      rideId: ride.id,
      discountApplied: discountAmount,
    });
  }

  return { payment, clientSecret };
}

export async function getPaymentForRide(userId, userRole, rideId) {
  const ride = await rideRepository.findById(rideId);
  if (!ride) throw ApiError.notFound("Ride not found");

  const isPassenger = ride.passenger.userId === userId;
  const isDriver = ride.driver?.userId === userId;
  if (!isPassenger && !isDriver && userRole !== "ADMIN") {
    throw ApiError.notFound("Ride not found");
  }

  const payment = await paymentRepository.findByRideId(rideId);
  if (!payment) throw ApiError.notFound("No payment recorded for this ride yet");
  return payment;
}

// ---------------------------------------------------------------------------
// Stripe webhook handling — see webhook.controller.js for signature
// verification, which happens before this is ever called.
// ---------------------------------------------------------------------------

export async function handleStripeEvent(event) {
  const intent = event.data.object;
  const isTopUp = intent.metadata?.type === "WALLET_TOPUP";

  if (event.type === "payment_intent.succeeded") {
    if (isTopUp) {
      await walletService.confirmTopUp(intent.metadata.userId, intent.amount, intent.id);
      return;
    }
    const payment = await paymentRepository.findByStripePaymentIntentId(intent.id);
    // Idempotency guard against redelivery: a payment already COMPLETED
    // must not be re-processed by a duplicate delivery of this same
    // event. Deliberately allows PENDING *or* FAILED here, not just
    // PENDING — Stripe doesn't guarantee webhook delivery order, and a
    // `payment_intent.payment_failed` for this same intent could have
    // been delivered first (a transient decline retried and later
    // succeeded, or simply an out-of-order delivery). `succeeded` is
    // always the authoritative, final truth for a given intent — this
    // reconciles a stale FAILED back to COMPLETED rather than leaving a
    // payment stuck showing failed when Stripe says it actually went
    // through. The reverse is never allowed (see the failed handler
    // below): a stale `failed` can never downgrade an already-COMPLETED
    // payment.
    if (payment && payment.status !== "COMPLETED") {
      await paymentRepository.updateStatus(payment.id, "COMPLETED", { paidAt: new Date() });
      paymentOutcomesTotal.inc({ method: "CARD", outcome: "completed" });
    }
  } else if (event.type === "payment_intent.payment_failed") {
    if (isTopUp) return; // nothing was ever credited, so there's nothing to roll back
    const payment = await paymentRepository.findByStripePaymentIntentId(intent.id);
    if (payment && payment.status === "PENDING") {
      await paymentRepository.updateStatus(payment.id, "FAILED", {
        failureReason: intent.last_payment_error?.message ?? "Payment failed",
      });
      paymentOutcomesTotal.inc({ method: "CARD", outcome: "failed" });
    }
  }
}

// ---------------------------------------------------------------------------
// Admin: listing and refunds
// ---------------------------------------------------------------------------

export async function listPayments({ page, limit, status }) {
  const [payments, total] = await Promise.all([
    paymentRepository.list({ page, limit, status }),
    paymentRepository.count({ status }),
  ]);
  return { payments, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getPaymentById(id) {
  const payment = await paymentRepository.findById(id);
  if (!payment) throw ApiError.notFound("Payment not found");
  return payment;
}

/**
 * Refund destination follows the original payment's provider: a Stripe
 * charge gets refunded through Stripe (money leaves through the same door
 * it came in); a WALLET or CASH payment gets refunded by crediting the
 * payer's wallet, since that's the only channel available to push money
 * back to them ourselves — there's no card to reverse a cash charge on.
 */
export async function refundPayment(paymentId, { amount, reason }, actor) {
  const payment = await paymentRepository.findById(paymentId);
  if (!payment) throw ApiError.notFound("Payment not found");
  if (!["COMPLETED", "PARTIALLY_REFUNDED"].includes(payment.status)) {
    throw ApiError.conflict(`Cannot refund a payment in ${payment.status} status`);
  }

  const alreadyRefunded = await refundRepository.sumCompletedByPayment(paymentId);
  const remaining = Number(payment.amount) - alreadyRefunded;
  const refundAmount = amount ?? remaining;

  if (refundAmount <= 0 || refundAmount > remaining + 0.001) {
    throw ApiError.badRequest(`Refund amount must be between 0 and ${remaining.toFixed(2)}`);
  }

  const totalRefunded = alreadyRefunded + refundAmount;
  const newStatus = totalRefunded >= Number(payment.amount) - 0.001 ? "REFUNDED" : "PARTIALLY_REFUNDED";

  let refund;
  if (payment.provider === "STRIPE") {
    if (!stripe) throw ApiError.internal("Card payments are not configured on this server");

    // The Stripe call itself can't be inside a DB transaction (it's a
    // network call to an external system), but everything that happens in
    // *our* database as a result of it can and must land together — a
    // crash between recording the refund and updating the payment status
    // used to be able to leave one without the other.
    //
    // Idempotency key: there's no client-supplied Idempotency-Key header
    // on this endpoint (yet), so this is keyed on (paymentId, the
    // cumulative amount already refunded before this call, this refund's
    // amount) — a genuine retry of the same request (same payment, same
    // starting point, same amount) reuses the key and gets Stripe's cached
    // result instead of creating a second refund; a *different* refund
    // request naturally gets a different key since `alreadyRefunded` has
    // moved on.
    const stripeRefund = await stripe.refunds.create(
      {
        payment_intent: payment.stripePaymentIntentId,
        amount: toStripeCents(refundAmount),
      },
      { idempotencyKey: `refund-${paymentId}-${alreadyRefunded}-${refundAmount}` }
    );
    const refundStatus = stripeRefund.status === "succeeded" ? "COMPLETED" : "PENDING";

    [refund] = await prisma.$transaction([
      refundRepository.create({
        paymentId,
        amount: refundAmount,
        reason,
        status: refundStatus,
        stripeRefundId: stripeRefund.id,
        processedAt: refundStatus === "COMPLETED" ? new Date() : null,
      }),
      paymentRepository.updateStatus(paymentId, newStatus),
    ]);
  } else {
    // Wallet credit + its ledger entry + the refund record + the payment's
    // new status all have to land together — this used to be separate,
    // non-transactional writes, so a crash partway through could leave
    // money credited with no Refund row to show for it, or a Payment still
    // reading COMPLETED after the payer was already refunded. The refund
    // row is created first, inside the transaction, so its own id (unique
    // per refund attempt) can key the wallet ledger entry — using the
    // shared paymentId there instead would collide with the
    // (walletId, reason, referenceId) uniqueness constraint the moment a
    // payment gets a second partial refund.
    await prisma.$transaction(async (tx) => {
      refund = await refundRepository.create(
        { paymentId, amount: refundAmount, reason, status: "COMPLETED", processedAt: new Date() },
        tx
      );
      await walletService.creditRefund(payment.payerId, refundAmount, refund.id, tx);
      await paymentRepository.updateStatus(paymentId, newStatus, {}, tx);
    });
  }

  const updatedPayment = await paymentRepository.findById(paymentId);

  await auditLogRepository.record({
    actorId: actor.id,
    action: "PAYMENT_REFUNDED",
    entityType: "Payment",
    entityId: paymentId,
    metadata: { amount: refundAmount, reason },
    ipAddress: actor.ipAddress,
  });

  const payer = await userRepository.findById(payment.payerId);
  if (payer) {
    await notificationService.notify({
      userId: payer.id,
      email: payer.email,
      channel: "EMAIL",
      title: "Refund processed",
      html: `<p>A refund of $${refundAmount.toFixed(2)} has been processed for your ride payment.</p><p>Reason: ${reason}</p>`,
    });
  }

  return { payment: updatedPayment, refund };
}
