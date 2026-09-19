import { ValidationError } from '../../../shared/errors';

export interface ParticipantShareInput {
  userId: string;
  shares: number; // positive integer >= 1
}

export interface SharesSplitResult {
  userId: string;
  amount: number; // minor units (paise)
  shares: number;
}

/**
 * Calculates share-based splits among participants using the Largest Remainder Method.
 *
 * Algorithm & Mathematical Foundation:
 * Given:
 *   - totalAmount (in integer paise)
 *   - participantShares s_1, s_2, ..., s_n (where each s_i is a positive integer >= 1)
 *   - totalShares = sum(s_i)
 *
 * Step 1: Input Validation
 *   - totalAmount must be a positive integer in minor units (paise > 0).
 *   - At least 1 participant is required.
 *   - Each participant's share must be an integer >= 1.
 *
 * Step 2: Integer Floor Allocation
 *   For each participant i:
 *     product_i = totalAmount * s_i
 *     floorAmount_i = Math.floor(product_i / totalShares)
 *     remainder_i = product_i % totalShares
 *   Note: Because denominator is totalShares for all participants, remainder_i is an
 *   EXACT integer. Zero floating-point arithmetic is used.
 *
 * Step 3: Remainder Paise Distribution
 *   unallocatedPaise = totalAmount - sum(floorAmount_i)
 *   Notice: 0 <= unallocatedPaise < totalShares.
 *
 * Step 4: Deterministic Ranking
 *   Participants are ranked descending by remainder_i.
 *   Ties are broken deterministically by their original index in the input array.
 *
 * Step 5: Surplus Allocation
 *   Each of the top `unallocatedPaise` participants receives exactly +1 paise.
 *
 * Step 6: Invariant Guarantee
 *   sum(finalAmounts) === totalAmount. Every single paise is preserved with 0 drift.
 */
export function calculateSharesSplit(
  totalAmount: number,
  participants: ParticipantShareInput[]
): SharesSplitResult[] {
  if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
    throw new ValidationError('Total amount must be a positive integer in minor units');
  }

  if (!participants || participants.length === 0) {
    throw new ValidationError('At least one participant is required for shares split');
  }

  let totalShares = 0;
  for (const p of participants) {
    if (!Number.isInteger(p.shares) || p.shares <= 0) {
      throw new ValidationError(
        `Participant shares must be a positive integer (received: ${p.shares})`
      );
    }
    totalShares += p.shares;
  }

  if (totalShares <= 0) {
    throw new ValidationError('Total shares must be greater than zero');
  }

  // Step 2: Calculate floor allocations and exact integer remainders
  const allocations = participants.map((p, index) => {
    const product = totalAmount * p.shares;
    const basePaise = Math.floor(product / totalShares);
    const remainder = product % totalShares;

    return {
      userId: p.userId,
      shares: p.shares,
      basePaise,
      remainder,
      originalIndex: index,
    };
  });

  const allocatedSum = allocations.reduce((sum, a) => sum + a.basePaise, 0);
  const remainingPaise = totalAmount - allocatedSum;

  // Step 4: Sort descending by integer remainder; break ties by originalIndex
  const sorted = [...allocations].sort((a, b) => {
    if (b.remainder !== a.remainder) {
      return b.remainder - a.remainder;
    }
    return a.originalIndex - b.originalIndex;
  });

  // Step 5: Allocate 1 paise to top remainder participants
  for (let i = 0; i < remainingPaise && i < sorted.length; i++) {
    sorted[i].basePaise += 1;
  }

  // Step 6: Restore original input order
  sorted.sort((a, b) => a.originalIndex - b.originalIndex);

  const results: SharesSplitResult[] = sorted.map((item) => ({
    userId: item.userId,
    amount: item.basePaise,
    shares: item.shares,
  }));

  // Strict invariant validation
  const finalSum = results.reduce((sum, r) => sum + r.amount, 0);
  if (finalSum !== totalAmount) {
    throw new ValidationError(
      `Split sum invariant violation: expected ${totalAmount} paise, got ${finalSum} paise`
    );
  }

  return results;
}
