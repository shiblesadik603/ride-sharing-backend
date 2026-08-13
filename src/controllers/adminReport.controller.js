import { ApiResponse } from "../utils/ApiResponse.js";
import * as reportService from "../services/report.service.js";

function resolveRange(query) {
  const to = query.to ?? new Date();
  const from = query.from ?? new Date(to.getTime() - 24 * 60 * 60 * 1000);
  return { from, to };
}

export async function getSummary(req, res) {
  const summary = await reportService.generateSummary(resolveRange(req.query));
  res.status(200).json(new ApiResponse(200, summary));
}

export async function sendSummary(req, res) {
  const summary = await reportService.generateAndEmailSummary(resolveRange(req.query));
  res.status(200).json(new ApiResponse(200, summary, "Summary generated and emailed to admins"));
}
