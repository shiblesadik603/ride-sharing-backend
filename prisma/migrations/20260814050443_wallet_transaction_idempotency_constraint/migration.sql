-- De-duplicate referenceId within (walletId, reason) for rows written
-- before this constraint existed. The old code path keyed every REFUND
-- ledger entry off the shared paymentId, so a payment refunded in two
-- partial installments produced two rows with the same (walletId, reason,
-- referenceId) — legitimate history, not corruption. Keep the first
-- occurrence's referenceId untouched and disambiguate every later
-- duplicate by appending its own row id (always unique), rather than
-- deleting a real financial ledger entry to make room for the constraint.
WITH ranked AS (
  SELECT id, "referenceId",
         ROW_NUMBER() OVER (PARTITION BY "walletId", reason, "referenceId" ORDER BY "createdAt") AS rn
  FROM wallet_transactions
  WHERE "referenceId" IS NOT NULL
)
UPDATE wallet_transactions wt
SET "referenceId" = wt."referenceId" || '#' || wt.id
FROM ranked
WHERE wt.id = ranked.id AND ranked.rn > 1;

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_walletId_reason_referenceId_key" ON "wallet_transactions"("walletId", "reason", "referenceId");
