/**
 * Central licence pricing configuration.
 *
 * This is the SINGLE source of truth for plan types and per-learner annual
 * prices (ZAR cents). Client checkout totals, PayFast payment initiation and
 * PayFast ITN amount validation all use these values so every surface
 * computes exactly the same amount.
 *
 * The backend always determines the final price from the plan type — a price
 * sent from the frontend is never trusted.
 */

export const LICENSE_PLAN_TYPES = ["teacher", "head_of_grade", "school"] as const;

export type LicensePlanType = (typeof LICENSE_PLAN_TYPES)[number];

/** Human-readable plan names (used for PayFast item names and UI labels). */
export const LICENSE_PLAN_LABELS: Record<LicensePlanType, string> = {
  teacher: "Teacher",
  head_of_grade: "Head of Grade",
  school: "School",
};

/** Price per learner per year, in cents (ZAR). */
export const PRICE_PER_LEARNER_CENTS_BY_PLAN: Record<LicensePlanType, number> = {
  teacher: 2500, // R25.00
  head_of_grade: 2300, // R23.00
  school: 2000, // R20.00
};

export function isLicensePlanType(value: unknown): value is LicensePlanType {
  return typeof value === "string" && (LICENSE_PLAN_TYPES as readonly string[]).includes(value);
}

export function licensePlanLabel(planType: LicensePlanType): string {
  return LICENSE_PLAN_LABELS[planType];
}

/** Per-learner annual price in cents for a plan. Throws for unknown plans. */
export function pricePerLearnerCents(planType: LicensePlanType): number {
  const price = PRICE_PER_LEARNER_CENTS_BY_PLAN[planType];
  if (price === undefined) {
    throw new Error(`No price configured for licence plan type: ${planType}`);
  }
  return price;
}

/** Total licence amount in cents: learner count × the plan's per-learner rate. */
export function calculateLicenceAmountCents(planType: LicensePlanType, learnerCount: number): number {
  return learnerCount * pricePerLearnerCents(planType);
}
