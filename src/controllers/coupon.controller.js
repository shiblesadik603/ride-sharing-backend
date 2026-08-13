import { ApiResponse } from "../utils/ApiResponse.js";
import * as couponService from "../services/coupon.service.js";

export async function create(req, res) {
  const coupon = await couponService.createCoupon(req.body);
  res.status(201).json(new ApiResponse(201, coupon, "Coupon created"));
}

export async function list(req, res) {
  const result = await couponService.listCoupons(req.query);
  res.status(200).json(new ApiResponse(200, result));
}

export async function update(req, res) {
  const coupon = await couponService.updateCoupon(req.params.id, req.body);
  res.status(200).json(new ApiResponse(200, coupon, "Coupon updated"));
}
