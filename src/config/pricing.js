/**
 * Placeholder pricing table — illustrative numbers for a working demo,
 * not real business figures. In production this would live in the
 * database (admin-editable, per-city, versioned for surge pricing) rather
 * than a static file; hardcoding it here keeps this phase scoped to "does
 * the fare pipeline work end to end" rather than building a pricing CMS.
 */
export const PRICING = {
  BIKE: { currency: "USD", baseFare: 2.0, perKm: 0.5, perMin: 0.1 },
  AUTO: { currency: "USD", baseFare: 3.0, perKm: 0.8, perMin: 0.15 },
  HATCHBACK: { currency: "USD", baseFare: 4.0, perKm: 1.0, perMin: 0.18 },
  SEDAN: { currency: "USD", baseFare: 5.0, perKm: 1.2, perMin: 0.2 },
  SUV: { currency: "USD", baseFare: 7.0, perKm: 1.5, perMin: 0.25 },
};
