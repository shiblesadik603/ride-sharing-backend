import { prisma } from "../config/database.js";
import { ApiError } from "../utils/ApiError.js";
import { stripe } from "../config/stripe.js";
import { toStripeCents } from "../utils/money.util.js";
import * as paymentRepository from "../repositories/payment.repository.js";
import * as refundRepository from "../repositories/refund.repository.js";
import * as rideRepository from "../repositories/ride.repository.js";
import * as walletRepository from "../repositories/wallet.repository.js";
import * as couponRedemptionRepository from "../repositories/couponRedemption.repository.js";
import * as auditLogRepository from "../repositories/auditLog.repository.js";
import * as couponService from "./coupon.service.js";
import * as walletService from "./wallet.service.js";

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
  } else {
    if (!stripe) throw ApiError.internal("Card payments are not configured on this server");

    const intent = await stripe.paymentIntents.create({
      amount: toStripeCents(amount),
      currency: ride.currency.toLowerCase(),
      metadata: { type: "RIDE_PAYMENT", rideId: ride.id, userId },
    });
    clientSecret = intent.client_secret;

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
    // Idempotency guard: webhooks can be redelivered, and only a PENDING
    // payment should ever transition — a second delivery of the same
    // event must not re-process an already-COMPLETED payment.
    if (payment && payment.status === "PENDING") {
      await paymentRepository.updateStatus(payment.id, "COMPLETED", { paidAt: new Date() });
    }
  } else if (event.type === "payment_intent.payment_failed") {
    if (isTopUp) return; // nothing was ever credited, so there's nothing to roll back
    const payment = await paymentRepository.findByStripePaymentIntentId(intent.id);
    if (payment && payment.status === "PENDING") {
      await paymentRepository.updateStatus(payment.id, "FAILED", {
        failureReason: intent.last_payment_error?.message ?? "Payment failed",
      });
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

  let refund;
  if (payment.provider === "STRIPE") {
    if (!stripe) throw ApiError.internal("Card payments are not configured on this server");

    const stripeRefund = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      amount: toStripeCents(refundAmount),
    });

    refund = await refundRepository.create({
      paymentId,
      amount: refundAmount,
      reason,
      status: stripeRefund.status === "succeeded" ? "COMPLETED" : "PENDING",
      stripeRefundId: stripeRefund.id,
      processedAt: stripeRefund.status === "succeeded" ? new Date() : null,
    });
  } else {
    await walletService.creditRefund(payment.payerId, refundAmount, paymentId);
    refund = await refundRepository.create({
      paymentId,
      amount: refundAmount,
      reason,
      status: "COMPLETED",
      processedAt: new Date(),
    });
  }

  const totalRefunded = alreadyRefunded + refundAmount;
  const newStatus = totalRefunded >= Number(payment.amount) - 0.001 ? "REFUNDED" : "PARTIALLY_REFUNDED";
  const updatedPayment = await paymentRepository.updateStatus(paymentId, newStatus);

  await auditLogRepository.record({
    actorId: actor.id,
    action: "PAYMENT_REFUNDED",
    entityType: "Payment",
    entityId: paymentId,
    metadata: { amount: refundAmount, reason },
    ipAddress: actor.ipAddress,
  });

  return { payment: updatedPayment, refund };
}
