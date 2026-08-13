import { ApiResponse } from "../utils/ApiResponse.js";
import * as walletService from "../services/wallet.service.js";

export async function getMyWallet(req, res) {
  const result = await walletService.getWallet(req.user.id, req.query);
  res.status(200).json(new ApiResponse(200, result));
}

export async function topUp(req, res) {
  const result = await walletService.initiateTopUp(req.user.id, req.body.amount);
  res.status(200).json(new ApiResponse(200, result, "Top-up payment intent created"));
}

export async function adjustBalance(req, res) {
  const wallet = await walletService.adjustBalance(req.params.userId, req.body.amount, req.body.reason, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json(new ApiResponse(200, wallet, "Wallet adjusted"));
}
