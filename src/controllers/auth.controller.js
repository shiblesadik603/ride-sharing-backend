import { ApiResponse } from "../utils/ApiResponse.js";
import { refreshTokenCookieOptions } from "../services/token.service.js";
import * as authService from "../services/auth.service.js";

function sessionMeta(req) {
  return { deviceInfo: req.headers["user-agent"], ipAddress: req.ip };
}

/** Cookie for web clients; body field for native/mobile clients. Web
 * clients should ignore the body field and rely on the httpOnly cookie —
 * it's included for platforms where an httpOnly cookie isn't usable. */
function sendSession(res, statusCode, { user, accessToken, refreshToken }, message) {
  res.cookie("refreshToken", refreshToken, refreshTokenCookieOptions);
  res
    .status(statusCode)
    .json(new ApiResponse(statusCode, { user, accessToken, refreshToken }, message));
}

function getRefreshToken(req) {
  return req.cookies?.refreshToken || req.body?.refreshToken;
}

export async function register(req, res) {
  const result = await authService.register(req.body);
  sendSession(res, 201, result, "Registration successful. Please verify your email.");
}

export async function login(req, res) {
  const result = await authService.login({ ...req.body, ...sessionMeta(req) });
  sendSession(res, 200, result, "Login successful");
}

export async function googleAuth(req, res) {
  const result = await authService.googleAuth({ ...req.body, ...sessionMeta(req) });
  sendSession(res, 200, result, "Login successful");
}

export async function refresh(req, res) {
  const result = await authService.refresh({
    refreshToken: getRefreshToken(req),
    ...sessionMeta(req),
  });
  res.cookie("refreshToken", result.refreshToken, refreshTokenCookieOptions);
  res
    .status(200)
    .json(new ApiResponse(200, result, "Token refreshed"));
}

export async function logout(req, res) {
  await authService.logout({ refreshToken: getRefreshToken(req) });
  res.clearCookie("refreshToken", refreshTokenCookieOptions);
  res.status(200).json(new ApiResponse(200, null, "Logged out"));
}

export async function forgotPassword(req, res) {
  await authService.forgotPassword(req.body);
  res
    .status(200)
    .json(new ApiResponse(200, null, "If that email is registered, a reset link has been sent"));
}

export async function resetPassword(req, res) {
  await authService.resetPassword(req.body);
  res.status(200).json(new ApiResponse(200, null, "Password reset successful. Please log in again."));
}

export async function verifyEmail(req, res) {
  await authService.verifyEmail(req.body);
  res.status(200).json(new ApiResponse(200, null, "Email verified"));
}

export async function resendVerification(req, res) {
  await authService.resendVerificationEmail(req.body);
  res
    .status(200)
    .json(new ApiResponse(200, null, "If that email exists and is unverified, a new link has been sent"));
}
