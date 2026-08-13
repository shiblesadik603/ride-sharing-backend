import { z } from "zod";
import { registry, jsonBody, successResponse, standardErrors, bearerAuth } from "../registry.js";
import { topUpSchema, walletHistoryQuerySchema } from "../../validators/wallet.validator.js";

const walletSchema = registry.register(
  "Wallet",
  z.object({ id: z.string(), userId: z.string(), balance: z.string(), currency: z.string() })
);

const walletTransactionSchema = registry.register(
  "WalletTransaction",
  z.object({
    id: z.string(),
    type: z.enum(["CREDIT", "DEBIT"]),
    reason: z.enum(["TOPUP", "RIDE_PAYMENT", "RIDE_EARNING", "REFUND", "PROMO", "WITHDRAWAL", "ADJUSTMENT"]),
    amount: z.string(),
    balanceAfter: z.string(),
  })
);

function walletRoute(config) {
  registry.registerPath({ tags: ["Wallet"], security: bearerAuth, ...config });
}

walletRoute({
  method: "get",
  path: "/api/v1/wallet/me",
  summary: "Get your wallet balance and transaction history",
  request: { query: walletHistoryQuerySchema.shape.query },
  responses: {
    200: successResponse(
      z.object({ wallet: walletSchema, transactions: z.array(walletTransactionSchema), pagination: z.unknown() })
    ),
    ...standardErrors(401, 404),
  },
});

walletRoute({
  method: "post",
  path: "/api/v1/wallet/me/topup",
  summary: "Start a wallet top-up",
  description: "Creates a Stripe PaymentIntent — the wallet is credited only once the webhook confirms the charge succeeded, never directly from this call. Requires STRIPE_SECRET_KEY.",
  request: jsonBody(topUpSchema.shape.body),
  responses: { 200: successResponse(z.object({ clientSecret: z.string() })), ...standardErrors(400, 401) },
});

export { walletSchema, walletTransactionSchema };
