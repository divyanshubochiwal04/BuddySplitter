import { z } from 'zod';
import { ValidationError } from '../../shared/errors';
import { toPaise } from '../../shared/currency';

export const descriptionSchema = z
  .string()
  .trim()
  .min(1, 'Description is required')
  .max(100, 'Description must be 100 characters or fewer');

export function validateDescription(input: unknown): string {
  const result = descriptionSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0].message);
  }
  return result.data;
}

/**
 * Parses user input into integer minor units (paise).
 * Accepts: "2400", "2400.50", "₹2400", "₹ 2400.50"
 * Rejects: negative numbers, 0, non-numeric strings, malformed numbers.
 */
export function parseAndValidateAmount(input: string): number {
  if (typeof input !== 'string') {
    throw new ValidationError('Amount must be a string');
  }

  // Strip currency symbols (₹, Rs, rs), commas, spaces
  const cleaned = input
    .replace(/[₹\s,]/g, '')
    .replace(/^(rs|inr)\.?/i, '')
    .trim();

  // Validate format: must be valid positive decimal with up to 2 decimal places
  const numberPattern = /^\d+(\.\d{1,2})?$/;
  if (!numberPattern.test(cleaned)) {
    throw new ValidationError('Please enter a valid positive amount (e.g. 2400 or 2400.50)');
  }

  const parsed = parseFloat(cleaned);
  if (isNaN(parsed) || parsed <= 0) {
    throw new ValidationError('Amount must be greater than zero');
  }

  // Convert to paise
  const paise = toPaise(parsed);
  if (paise <= 0) {
    throw new ValidationError('Amount must be at least ₹0.01 (1 paisa)');
  }

  return paise;
}

export function validateParticipantSelection(participantUserIds: string[]): string[] {
  if (!Array.isArray(participantUserIds) || participantUserIds.length === 0) {
    throw new ValidationError('At least one participant must be selected to split the expense');
  }
  // Remove duplicates
  return Array.from(new Set(participantUserIds));
}
