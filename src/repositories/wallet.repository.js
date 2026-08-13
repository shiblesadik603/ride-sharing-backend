import { prisma } from "../config/database.js";

/**
 * Every mutating function here accepts an optional `client`, defaulting to
 * the shared singleton — passing a `tx` from `prisma.$transaction(async
 * (tx) => ...)` lets a caller (payment.service.js) chain a debit + ledger
 * write + payment row into one atomic transaction, since those three
 * writes must all succeed or all fail together.
 */

export function findByUserId(userId, client = prisma) {
  return client.wallet.findUnique({ where: { userId } });
}

export function listTransactions(walletId, { page, limit }) {
  return prisma.walletTransaction.findMany({
    where: { walletId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });
}

export function countTransactions(walletId) {
  return prisma.walletTransaction.count({ where: { walletId } });
}

/**
 * The overdraft guard: `balance >= amount` in the WHERE clause and
 * `decrement` in the SET clause compile to a single atomic
 * `UPDATE ... SET balance = balance - $1 WHERE id = $2 AND balance >= $1`.
 * Postgres serializes concurrent updates to the same row, so two racing
 * debits can't both succeed against insufficient funds — exactly the same
 * pattern as `ride.repository.js: tryAssignDriver`. `count === 0` means
 * either the wallet doesn't exist or funds were insufficient.
 */
export function tryDebit(walletId, amount, client = prisma) {
  return client.wallet.updateMany({
    where: { id: walletId, balance: { gte: amount } },
    data: { balance: { decrement: amount } },
  });
}

export function credit(walletId, amount, client = prisma) {
  return client.wallet.update({
    where: { id: walletId },
    data: { balance: { increment: amount } },
  });
}

export function createTransaction(data, client = prisma) {
  return client.walletTransaction.create({ data });
}
