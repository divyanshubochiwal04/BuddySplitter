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

export type QuickAddErrorType =
  | 'MISSING_AMOUNT'
  | 'INVALID_AMOUNT'
  | 'MISSING_DESCRIPTION'
  | 'MALFORMED';

export type QuickAddParseResult =
  | { success: true; description: string; totalAmount: number }
  | { success: false; errorType: QuickAddErrorType; message: string };

/**
 * Parses a Quick Add input string into description and total amount in minor units (paise).
 * Format: `<description> <amount>`
 * e.g. "Dinner 1200", "Cab 450", "Hotel 2500"
 */
export function parseQuickAddExpense(input: string): QuickAddParseResult {
  if (typeof input !== 'string') {
    return {
      success: false,
      errorType: 'MALFORMED',
      message: "I couldn't understand that expense.",
    };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return {
      success: false,
      errorType: 'MALFORMED',
      message: "I couldn't understand that expense.",
    };
  }

  // Check if entire input is just an amount without description (e.g. "1200", "₹1200", "Rs 500", "1200.50", "-50")
  const amountOnlyPattern = /^([₹]|rs\.?|inr)?\s*-?\d+(\.\d+)?$/i;
  if (amountOnlyPattern.test(trimmed)) {
    return {
      success: false,
      errorType: 'MISSING_DESCRIPTION',
      message: 'Add a description.',
    };
  }

  // If there are no digits at all in the text (e.g. "Dinner", "Coffee with friends"):
  if (!/\d/.test(trimmed)) {
    return {
      success: false,
      errorType: 'MISSING_AMOUNT',
      message: 'I need the amount too.',
    };
  }

  // Pattern to extract description and trailing amount
  const pattern = /^(.*?)\s+([₹]|rs\.?|inr)?\s*(-?\d+(?:\.\d+)?)$/i;
  const match = trimmed.match(pattern);

  if (match) {
    let descPart = match[1].trim();
    // Also remove trailing currency symbols from descPart if any
    descPart = descPart.replace(/\s*(?:₹|rs\.?|inr)$/i, '').trim();

    if (!descPart) {
      return {
        success: false,
        errorType: 'MISSING_DESCRIPTION',
        message: 'Add a description.',
      };
    }

    if (descPart.length > 100) {
      return {
        success: false,
        errorType: 'MALFORMED',
        message: 'Description must be 100 characters or fewer.',
      };
    }

    const rawNum = match[3];
    const numPart = parseFloat(rawNum);

    if (isNaN(numPart) || numPart <= 0) {
      return {
        success: false,
        errorType: 'INVALID_AMOUNT',
        message: 'Invalid amount.',
      };
    }

    // Check decimal places: up to 2
    const parts = rawNum.split('.');
    if (parts.length > 1 && parts[1].length > 2) {
      return {
        success: false,
        errorType: 'INVALID_AMOUNT',
        message: 'Invalid amount.',
      };
    }

    const paise = toPaise(numPart);
    if (paise <= 0) {
      return {
        success: false,
        errorType: 'INVALID_AMOUNT',
        message: 'Invalid amount.',
      };
    }

    return {
      success: true,
      description: descPart,
      totalAmount: paise,
    };
  }

  return {
    success: false,
    errorType: 'MALFORMED',
    message: "I couldn't understand that expense.",
  };
}

