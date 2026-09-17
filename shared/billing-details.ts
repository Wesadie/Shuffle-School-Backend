import { z } from "zod";

/**
 * Validation and sanitisation for customer billing details.
 *
 * The same schema is used everywhere billing details enter the system:
 * - the signup handoff/onboarding path (server), and
 * - the Licence & Billing settings endpoint (server).
 *
 * Sanitisation happens server-side on every submitted field: control
 * characters are stripped, whitespace is collapsed and values are trimmed
 * and length-capped before anything is persisted.
 */

export const BILLING_TEXT_MAX_LENGTH = 200;
export const BILLING_EMAIL_MAX_LENGTH = 320;
export const BILLING_PHONE_MAX_LENGTH = 32;

/** Strip control characters, collapse whitespace and trim. */
export function sanitizeBillingText(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keep only characters that are valid in a phone number. */
export function sanitizeBillingPhone(value: string): string {
  return value.replace(/[^\d+\-()\s]/g, "").replace(/\s+/g, " ").trim();
}

const billingTextField = (maxLength = BILLING_TEXT_MAX_LENGTH) =>
  z
    .string()
    .transform(sanitizeBillingText)
    .refine((value) => value.length > 0, "This field is required")
    .refine((value) => value.length <= maxLength, `Must be ${maxLength} characters or fewer`);

const optionalBillingTextField = (maxLength = BILLING_TEXT_MAX_LENGTH) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined ? null : sanitizeBillingText(value)))
    .transform((value) => (value && value.length > 0 ? value.slice(0, maxLength) : null));

const billingPhoneField = z
  .string()
  .optional()
  .transform((value) => (value === undefined ? null : sanitizeBillingPhone(value)))
  .refine(
    (value) => value === null || (value.length >= 7 && value.length <= BILLING_PHONE_MAX_LENGTH),
    "Enter a valid phone number",
  );

export interface BillingDetailsInput {
  billingName: string;
  organisationName: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  billingEmail: string;
  phone: string | null;
}

/**
 * Complete billing details. Core fields are required; the phone number and
 * the second address line are optional. The organisation (school) name is
 * optional at the schema level — plan-specific rules (the School plan
 * requires it) are enforced by the callers.
 */
export const billingDetailsSchema = z.object({
  billingName: billingTextField(),
  organisationName: optionalBillingTextField(),
  addressLine1: billingTextField(),
  addressLine2: optionalBillingTextField(),
  city: billingTextField(),
  province: billingTextField(),
  postalCode: billingTextField(20),
  country: billingTextField(),
  billingEmail: z
    .string()
    .transform(sanitizeBillingText)
    .refine((value) => value.length > 0, "Billing email is required")
    .refine((value) => value.length <= BILLING_EMAIL_MAX_LENGTH, "Billing email is too long")
    .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Enter a valid billing email address"),
  phone: billingPhoneField,
});

/** Country preselected when billing details are first captured. */
export const BILLING_DEFAULT_COUNTRY = "South Africa";
