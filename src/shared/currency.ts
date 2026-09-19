/**
 * Currency handling utilities
 *
 * Money is strictly stored in integer minor units (e.g., paise for INR).
 * ₹1 = 100 paise.
 * Floating point arithmetic for financial storage is avoided.
 */

/**
 * Converts a decimal monetary value in major units (e.g. ₹50.25) to integer minor units (e.g. 5025 paise).
 */
export function toPaise(rupees: number | string): number {
  const numeric = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (isNaN(numeric) || !isFinite(numeric)) {
    throw new Error(`Invalid monetary amount: ${rupees}`);
  }
  return Math.round(numeric * 100);
}

/**
 * Converts integer minor units (paise) to decimal major units (rupees).
 */
export function toRupees(paise: number): number {
  if (!Number.isInteger(paise)) {
    throw new Error(`Minor units must be an integer: received ${paise}`);
  }
  return paise / 100;
}

/**
 * Formats integer minor units into a human-readable currency string.
 * e.g., 1050 paise -> "₹10.50"
 */
export function formatPaise(paise: number, currency = 'INR'): string {
  const rupees = toRupees(paise);
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  return `${symbol}${rupees.toFixed(2)}`;
}

/**
 * Validates that an amount is a non-negative integer minor unit.
 */
export function isValidMoneyAmount(amount: unknown): amount is number {
  return typeof amount === 'number' && Number.isInteger(amount) && amount > 0;
}
