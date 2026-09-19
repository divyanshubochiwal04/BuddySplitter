import { ValidationError } from '../../../shared/errors';

export interface CustomSplitInput {
  userId: string;
  amount: number; // minor units (paise)
}

export interface CustomSplitValidationResult {
  isValid: boolean;
  sum: number;
  difference: number; // positive = short of total, negative = exceeds total
  errorMessage?: string;
}

export function validateCustomSplits(
  totalAmount: number,
  splits: CustomSplitInput[]
): CustomSplitValidationResult {
  if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
    throw new ValidationError('Total amount must be a positive integer in minor units');
  }

  if (splits.length === 0) {
    return {
      isValid: false,
      sum: 0,
      difference: totalAmount,
      errorMessage: 'At least one participant is required',
    };
  }

  let sum = 0;
  for (const split of splits) {
    if (!Number.isInteger(split.amount) || split.amount < 0) {
      return {
        isValid: false,
        sum,
        difference: totalAmount - sum,
        errorMessage: 'Each participant amount must be a non-negative integer in minor units',
      };
    }
    sum += split.amount;
  }

  const difference = totalAmount - sum;

  if (difference !== 0) {
    const status = difference > 0 ? 'short' : 'over';
    return {
      isValid: false,
      sum,
      difference,
      errorMessage: `Split sum does not equal total amount (is ${Math.abs(difference)} paise ${status})`,
    };
  }

  return {
    isValid: true,
    sum,
    difference: 0,
  };
}
