import { ApiResponse } from "../utils/ApiResponse.js";
import * as paymentService from "../services/payment.service.js";

export async function listPayments(req, res) {
  const result = await paymentService.listPayments(req.query);
  res.status(200).json(new ApiResponse(200, result));
}

export async function getPayment(req, res) {
  const payment = await paymentService.getPaymentById(req.params.id);
  res.status(200).json(new ApiResponse(200, payment));
}

export async function refundPayment(req, res) {
  const result = await paymentService.refundPayment(req.params.id, req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json(new ApiResponse(200, result, "Refund processed"));
}
