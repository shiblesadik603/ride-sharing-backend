-- Application code already prevents overdraft via an atomic conditional
-- UPDATE (wallet.repository.js: tryDebit — `WHERE balance >= amount`), but
-- that's a guarantee about *this codebase's* write path, not about the
-- column itself. A raw UPDATE run by hand, a future code path that
-- forgets to use tryDebit, or a bug anywhere else with write access to
-- this table could still push balance negative with nothing to stop it.
-- This makes "a wallet can never go negative" a database-level invariant,
-- not just an application-level convention.
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_non_negative" CHECK ("balance" >= 0);
