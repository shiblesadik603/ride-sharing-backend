import { ApiResponse } from "../utils/ApiResponse.js";
import * as analyticsService from "../services/analytics.service.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function resolveRange(query) {
  const to = query.to ?? new Date();
  const from = query.from ?? new Date(to.getTime() - THIRTY_DAYS_MS);
  return { from, to };
}

export async function getDashboard(req, res) {
  const dashboard = await analyticsService.getDashboard();
  res.status(200).json(new ApiResponse(200, dashboard));
}

export async function getRideTrends(req, res) {
  const { from, to } = resolveRange(req.query);
  const trends = await analyticsService.getRideTrends({ from, to, interval: req.query.interval });
  res.status(200).json(new ApiResponse(200, { from, to, interval: req.query.interval, trends }));
}

export async function getRevenueTrends(req, res) {
  const { from, to } = resolveRange(req.query);
  const trends = await analyticsService.getRevenueTrends({ from, to, interval: req.query.interval });
  res.status(200).json(new ApiResponse(200, { from, to, interval: req.query.interval, trends }));
}

export async function getTopDrivers(req, res) {
  const drivers = await analyticsService.getTopDrivers(req.query);
  res.status(200).json(new ApiResponse(200, drivers));
}
