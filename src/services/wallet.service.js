import { prisma } from "../config/database.js";
import { ApiError } from "../utils/ApiError.js";
import { stripe } from "../config/stripe.js";
import { toStripeCents, fromStripeCents } from "../utils/money.util.js";
import * as walletRepository from "../repositories/wallet.repository.js";
import * as auditLogRepository from "../repositories/auditLog.repository.js";

const MIN_TOPUP = 5;
const MAX_TOPUP = 1000;

export async function getWallet(userId, { page, limit }) {
  const wallet = await walletRepository.findByUserId(userId);
  if (!wallet) throw ApiError.notFound("Wallet not found");

  const [transactions, total] = await Promise.all([
    walletRepository.listTransactions(wallet.id, { page, limit }),
    walletRepository.countTransactions(wallet.id),
  ]);

  return { wallet, transactions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function initiateTopUp(userId, amount) {
  if (!stripe) throw ApiError.internal("Card payments are not configured on this server");
  if (amount < MIN_TOPUP || amount > MAX_TOPUP) {
    throw ApiError.badRequest(`Top-up amount must be between $${MIN_TOPUP} and $${MAX_TOPUP}`);
  }

  const intent = await stripe.paymentIntents.create({
    amount: toStripeCents(amount),
    currency: "usd",
    metadata: { type: "WALLET_TOPUP", userId },
  });

  return { clientSecret: intent.client_secret };
}

/**
 * Only ever called from the Stripe webhook (payment.service.js) once a
 * top-up PaymentIntent has actually succeeded — never from a client-facing
 * endpoint. Crediting a wallet has to be driven by confirmed payment, not
 * a client's say-so about whether their card succeeded.
 */
export async function confirmTopUp(userId, amountCents, paymentIntentId) {
  const wallet = await walletRepository.findByUserId(userId);
  if (!wallet) return;

  const amount = fromStripeCents(amountCents);

  try {
    await prisma.$transaction(async (tx) => {
      await walletRepository.credit(wallet.id, amount, tx);
      const updated = await walletRepository.findByUserId(userId, tx);
      await walletRepository.createTransaction(
        {
          walletId: wallet.id,
          type: "CREDIT",
          reason: "TOPUP",
          amount,
          balanceAfter: updated.balance,
          referenceId: paymentIntentId,
        },
        tx
      );
    });
  } catch (err) {
    // Stripe delivers webhooks at-least-once and does redeliver on
    // timeout/5xx — the unique (walletId, reason, referenceId) constraint
    // on WalletTransaction is what actually stops a redelivered event from
    // double-crediting. A P2002 here means "already processed this exact
    // PaymentIntent," so it's a successful no-op, not a failure: the
    // *whole* transaction (including the credit) rolled back atomically,
    // so returning normally is correct, and the webhook caller should get
    // a 200 rather than retry forever.
    if (err.code === "P2002") return;
    throw err;
  }
}

/**
 * Admin-only balance correction — support credits, manual reconciliation,
 * and (notably, in this project specifically) the only way to fund a
 * wallet for testing the WALLET payment path without live Stripe
 * credentials in this environment.
 */
export async function adjustBalance(targetUserId, amount, reason, actor) {
  const wallet = await walletRepository.findByUserId(targetUserId);
  if (!wallet) throw ApiError.notFound("Wallet not found");

  const type = amount >= 0 ? "CREDIT" : "DEBIT";
  const absAmount = Math.abs(amount);

  const updated = await prisma.$transaction(async (tx) => {
    if (type === "CREDIT") {
      await walletRepository.credit(wallet.id, absAmount, tx);
    } else {
      const result = await walletRepository.tryDebit(wallet.id, absAmount, tx);
      if (result.count === 0) {
        throw ApiError.badRequest("Insufficient wallet balance for this adjustment");
      }
    }
    const newWallet = await walletRepository.findByUserId(targetUserId, tx);
    await walletRepository.createTransaction(
      {
        walletId: wallet.id,
        type,
        reason: "ADJUSTMENT",
        amount: absAmount,
        balanceAfter: newWallet.balance,
        referenceId: null,
      },
      tx
    );
    return newWallet;
  });

  await auditLogRepository.record({
    actorId: actor.id,
    action: "WALLET_ADJUSTED",
    entityType: "Wallet",
    entityId: wallet.id,
    metadata: { amount, reason },
    ipAddress: actor.ipAddress,
  });

  return updated;
}

/**
 * Used by payment.service.js when refunding a WALLET or CASH payment —
 * crediting the wallet is the only channel available to push money back
 * to the payer ourselves; there's no card to reverse a charge on.
 *
 * Accepts an optional transaction client so the caller can fold this into
 * a larger atomic operation (the refund record + payment status update
 * that always accompany it). Without that, a crash between "wallet
 * credited" and "refund/payment rows written" leaves money credited with
 * no record of why, and risks a double refund if the request is retried.
 * Falls back to opening its own transaction when called standalone.
 */
export async function creditRefund(userId, amount, referenceId, client) {
  const run = async (tx) => {
    const wallet = await walletRepository.findByUserId(userId, tx);
    await walletRepository.credit(wallet.id, amount, tx);
    const updated = await walletRepository.findByUserId(userId, tx);
    await walletRepository.createTransaction(
      {
        walletId: wallet.id,
        type: "CREDIT",
        reason: "REFUND",
        amount,
        balanceAfter: updated.balance,
        referenceId,
      },
      tx
    );
  };

  if (client) return run(client);
  return prisma.$transaction(run);
}
