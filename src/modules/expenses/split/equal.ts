import { ValidationError } from '../../../shared/errors';

export interface SplitResult {
  userId: string;
  amount: number; // Stored in integer minor units (paise)
}

/**
 * Calculates equal splits among participants.
 * Deterministically distributes any remainder paise to avoid losing or creating money.
 * Sum of all split amounts is guaranteed to equal totalAmount.
 */
export function calculateEqualSplit(
  totalAmount: number,
  participantUserIds: string[]
): SplitResult[] {
  if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
    throw new ValidationError('Total amount must be a positive integer in minor units');
  }

  if (participantUserIds.length === 0) {
    throw new ValidationError('At least one participant is required for split');
  }

  const count = participantUserIds.length;
  const baseAmount = Math.floor(totalAmount / count);
  const remainder = totalAmount % count;

  return participantUserIds.map((userId, index) => {
    // Distribute remainder 1 paise to the first `remainder` participants
    const amount = index < remainder ? baseAmount + 1 : baseAmount;
    return {
      userId,
      amount,
    };
  });
}
