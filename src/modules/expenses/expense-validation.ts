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

export interface ParsedExpense {
  description: string;
  amountMinorUnits: number;
  totalAmount: number;
}

export type ExpenseParseErrorType =
  | 'MISSING_AMOUNT'
  | 'INVALID_AMOUNT'
  | 'MISSING_DESCRIPTION'
  | 'MALFORMED';

export type QuickAddErrorType = ExpenseParseErrorType;

export type ExpenseParseResult =
  | {
      success: true;
      data: ParsedExpense;
      description: string;
      totalAmount: number;
      amountMinorUnits: number;
    }
  | {
      success: false;
      errorType: ExpenseParseErrorType;
      message: string;
    };

export type QuickAddParseResult = ExpenseParseResult;

/**
 * Canonical single parser for expense inputs.
 * Reusable across "/add dinner 1200" and plain text "Dinner 1200".
 * Format: `<description> <amount>`
 * e.g. "Dinner 1200", "Cab 450", "Hotel 2500"
 */
export function parseExpenseInput(input: string): ExpenseParseResult {
  if (typeof input !== 'string') {
    return {
      success: false,
      errorType: 'MALFORMED',
      message: "I couldn't understand that expense.",
    };
  }

  let text = input.trim();
  // Strip leading /add command if passed
  if (text.startsWith('/add')) {
    text = text.replace(/^\/add(?:@\w+)?\s*/i, '').trim();
  }

  if (!text) {
    return {
      success: false,
      errorType: 'MALFORMED',
      message: "I couldn't understand that expense.",
    };
  }

  // Check if entire input is just an amount without description (e.g. "1200", "₹1200", "Rs 500", "1200.50", "-50")
  const amountOnlyPattern = /^([₹]|rs\.?|inr)?\s*-?\d+(\.\d+)?$/i;
  if (amountOnlyPattern.test(text)) {
    return {
      success: false,
      errorType: 'MISSING_DESCRIPTION',
      message: 'Add a description.',
    };
  }

  // If there are no spaces in text (single token, e.g. "dinner", "pent", "cab")
  const lastSpaceIndex = text.lastIndexOf(' ');
  if (lastSpaceIndex === -1) {
    return {
      success: false,
      errorType: 'MISSING_AMOUNT',
      message: 'I need the amount too.',
    };
  }

  let descCandidate = text.substring(0, lastSpaceIndex).trim();
  const amountCandidate = text.substring(lastSpaceIndex + 1).trim();

  // Strip trailing currency designators or "for" from description candidate if any (e.g. "Dinner ₹" -> "Dinner", "Dinner for" -> "Dinner")
  descCandidate = descCandidate
    .replace(/\s*(?:₹|rs\.?|inr)$/i, '')
    .replace(/\s+for$/i, '')
    .trim();

  if (!descCandidate) {
    return {
      success: false,
      errorType: 'MISSING_DESCRIPTION',
      message: 'Add a description.',
    };
  }

  if (descCandidate.length > 100) {
    return {
      success: false,
      errorType: 'MALFORMED',
      message: 'Description must be 100 characters or fewer.',
    };
  }

  // Validate amountCandidate: must be valid positive decimal with up to 2 decimal places
  const cleanedAmount = amountCandidate
    .replace(/[₹\s,]/g, '')
    .replace(/^(rs|inr)\.?/i, '')
    .trim();

  const numberPattern = /^\d+(\.\d{1,2})?$/;
  if (!numberPattern.test(cleanedAmount)) {
    // Check if amount was provided at the beginning (e.g. "1200 Dinner", "500 Chai", "₹500 for lunch")
    const firstSpaceIndex = text.indexOf(' ');
    if (firstSpaceIndex !== -1) {
      const firstCandidate = text.substring(0, firstSpaceIndex).trim();
      const restCandidate = text.substring(firstSpaceIndex + 1).trim();

      const cleanedFirst = firstCandidate
        .replace(/[₹\s,]/g, '')
        .replace(/^(rs|inr)\.?/i, '')
        .trim();

      if (numberPattern.test(cleanedFirst)) {
        const numFirst = parseFloat(cleanedFirst);
        if (!isNaN(numFirst) && numFirst > 0) {
          const paiseFirst = toPaise(numFirst);
          if (paiseFirst > 0) {
            const descFirst = restCandidate
              .replace(/^for\s+/i, '')
              .replace(/\s*(?:₹|rs\.?|inr)$/i, '')
              .trim();

            if (descFirst && descFirst.length <= 100) {
              return {
                success: true,
                data: {
                  description: descFirst,
                  amountMinorUnits: paiseFirst,
                  totalAmount: paiseFirst,
                },
                description: descFirst,
                totalAmount: paiseFirst,
                amountMinorUnits: paiseFirst,
              };
            }
          }
        }
      }
    }

    return {
      success: false,
      errorType: 'INVALID_AMOUNT',
      message: 'Invalid amount.',
    };
  }

  const numPart = parseFloat(cleanedAmount);
  if (isNaN(numPart) || numPart <= 0) {
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
    data: {
      description: descCandidate,
      amountMinorUnits: paise,
      totalAmount: paise,
    },
    description: descCandidate,
    totalAmount: paise,
    amountMinorUnits: paise,
  };
}

export const parseQuickAddExpense = parseExpenseInput;


