import { ApiResponse } from "../utils/ApiResponse.js";
import * as ratingService from "../services/rating.service.js";

export async function submit(req, res) {
  const rating = await ratingService.submitRating(req.user.id, req.params.id, req.body);
  res.status(201).json(new ApiResponse(201, rating, "Rating submitted"));
}

export async function getForRide(req, res) {
  const ratings = await ratingService.getRatingsForRide(req.user.id, req.user.role, req.params.id);
  res.status(200).json(new ApiResponse(200, ratings));
}

export async function myReceived(req, res) {
  const result = await ratingService.listMyReceivedRatings(req.user.id, req.query);
  res.status(200).json(new ApiResponse(200, result));
}
