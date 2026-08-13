import { ApiError } from "../utils/ApiError.js";
import * as couponRepository from "../repositories/coupon.repository.js";
import * as couponRedemptionRepository from "../repositories/couponRedemption.repository.js";

function computeDiscount(coupon, fareAmount) {
  const fare = Number(fareAmount);
  let discount =
    coupon.discountType === "PERCENTAGE"
      ? fare * (Number(coupon.discountValue) / 100)
      : Number(coupon.discountValue);

  if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount));
  discount = Math.min(discount, fare); // never discount more than the fare itself

  return Number(discount.toFixed(2));
}

/**
 * Read-and-check, not read-and-lock — under heavy concurrent redemption
 * of the same coupon, `usageLimit` could theoretically be oversold by a
 * handful of requests racing the count check (the same class of race
 * `wallet.repository.js: tryDebit` closes with an atomic conditional
 * update). Left as a plain count here because a promo code being
 * oversold by a few uses is a marketing-budget problem, not a funds-
 * safety one — the atomic-update treatment is reserved for money moving
 * in `wallet.repository.js`, where the failure mode is actually bad.
 */
export async function validateCoupon(code, userId, fareAmount) {
  const coupon = await couponRepository.findByCode(code);
  if (!coupon || !coupon.isActive) {
    throw ApiError.badRequest("Invalid coupon code");
  }

  const now = new Date();
  if (now < coupon.validFrom || now > coupon.validTo) {
    throw ApiError.badRequest("This coupon is not currently valid");
  }
  if (coupon.minRideFare && Number(fareAmount) < Number(coupon.minRideFare)) {
    throw ApiError.badRequest(`This coupon requires a minimum fare of ${coupon.minRideFare}`);
  }

  if (coupon.usageLimit !== null) {
    const totalRedemptions = await couponRedemptionRepository.countByCoupon(coupon.id);
    if (totalRedemptions >= coupon.usageLimit) {
      throw ApiError.badRequest("This coupon has reached its usage limit");
    }
  }

  const userRedemptions = await couponRedemptionRepository.countByCouponAndUser(coupon.id, userId);
  if (userRedemptions >= coupon.usagePerUser) {
    throw ApiError.badRequest("You have already used this coupon");
  }

  return { coupon, discountAmount: computeDiscount(coupon, fareAmount) };
}

export async function createCoupon(data) {
  const existing = await couponRepository.findByCode(data.code);
  if (existing) throw ApiError.conflict("A coupon with this code already exists");
  return couponRepository.create(data);
}

export async function updateCoupon(id, data) {
  const coupon = await couponRepository.findById(id);
  if (!coupon) throw ApiError.notFound("Coupon not found");
  return couponRepository.update(id, data);
}

export async function listCoupons({ page, limit, isActive }) {
  const [coupons, total] = await Promise.all([
    couponRepository.list({ page, limit, isActive }),
    couponRepository.count({ isActive }),
  ]);
  return { coupons, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
