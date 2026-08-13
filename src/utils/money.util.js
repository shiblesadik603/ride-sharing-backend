/** Stripe amounts are integer minor units (cents for USD) — our Decimal
 * columns are dollars. Converting at the two call sites that talk to
 * Stripe keeps every other amount in the codebase in human-readable units. */
export function toStripeCents(amount) {
  return Math.round(Number(amount) * 100);
}

export function fromStripeCents(cents) {
  return Number((cents / 100).toFixed(2));
}
