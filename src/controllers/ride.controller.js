import { ApiResponse } from "../utils/ApiResponse.js";
import * as rideService from "../services/ride.service.js";

export async function request(req, res) {
  const ride = await rideService.requestRide(req.user.id, req.body);
  res.status(201).json(new ApiResponse(201, ride, "Ride requested"));
}

export async function get(req, res) {
  const ride = await rideService.getRide(req.user.id, req.user.role, req.params.id);
  res.status(200).json(new ApiResponse(200, ride));
}

export async function history(req, res) {
  const result = await rideService.listPassengerHistory(req.user.id, req.query);
  res.status(200).json(new ApiResponse(200, result));
}

export async function driverHistory(req, res) {
  const result = await rideService.listDriverHistory(req.user.id, req.query);
  res.status(200).json(new ApiResponse(200, result));
}

export async function nearby(req, res) {
  const rides = await rideService.listNearby(req.user.id, req.query);
  res.status(200).json(new ApiResponse(200, rides));
}

export async function accept(req, res) {
  const ride = await rideService.acceptRide(req.user.id, req.params.id);
  res.status(200).json(new ApiResponse(200, ride, "Ride accepted"));
}

export async function reject(req, res) {
  await rideService.rejectRide(req.user.id, req.params.id);
  res.status(200).json(new ApiResponse(200, null, "Ride declined"));
}

export async function arrived(req, res) {
  const ride = await rideService.markArrived(req.user.id, req.params.id);
  res.status(200).json(new ApiResponse(200, ride, "Marked as arrived"));
}

export async function start(req, res) {
  const ride = await rideService.startRide(req.user.id, req.params.id, req.body.otpCode);
  res.status(200).json(new ApiResponse(200, ride, "Ride started"));
}

export async function complete(req, res) {
  const ride = await rideService.completeRide(req.user.id, req.params.id);
  res.status(200).json(new ApiResponse(200, ride, "Ride completed"));
}

export async function cancel(req, res) {
  const ride = await rideService.cancelRide(req.user.id, req.params.id, req.body.reason);
  res.status(200).json(new ApiResponse(200, ride, "Ride cancelled"));
}
