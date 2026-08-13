import { ApiResponse } from "../utils/ApiResponse.js";
import * as paymentService from "../services/payment.service.js";

export async function pay(req, res) {
  const result = await paymentService.payForRide(req.user.id, req.params.id, req.body);
  res.status(201).json(new ApiResponse(201, result, "Payment initiated"));
}

export async function getForRide(req, res) {
  const payment = await paymentService.getPaymentForRide(req.user.id, req.user.role, req.params.id);
  res.status(200).json(new ApiResponse(200, payment));
}
