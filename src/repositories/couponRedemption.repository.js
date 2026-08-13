import { prisma } from "../config/database.js";

export function create(data) {
  return prisma.couponRedemption.create({ data });
}

export function countByCoupon(couponId) {
  return prisma.couponRedemption.count({ where: { couponId } });
}

export function countByCouponAndUser(couponId, userId) {
  return prisma.couponRedemption.count({ where: { couponId, userId } });
}
