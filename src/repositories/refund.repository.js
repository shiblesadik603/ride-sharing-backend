import { prisma } from "../config/database.js";

export function create(data) {
  return prisma.refund.create({ data });
}

export async function sumCompletedByPayment(paymentId) {
  const result = await prisma.refund.aggregate({
    where: { paymentId, status: "COMPLETED" },
    _sum: { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}
