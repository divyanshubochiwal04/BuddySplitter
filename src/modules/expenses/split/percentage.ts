import { ValidationError } from '../../../shared/errors';

export interface PercentageSplitInput {
  userId: string;
  percentage: number; // e.g. 25 or 33.33
}

export interface PercentageSplitResult {
  userId: string;
  amount: number; // minor units (paise)
  percentage: number;
}

export function calculatePercentageSplit(
  totalAmount: number,
  splits: PercentageSplitInput[]
): PercentageSplitResult[] {
  if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
    throw new ValidationError('Total amount must be a positive integer in minor units');
  }

  if (splits.length === 0) {
    throw new ValidationError('At least one participant is required');
  }

  // Validate percentages
  let totalPercentage = 0;
  for (const s of splits) {
    if (s.percentage < 0 || s.percentage > 100) {
      throw new ValidationError(`Invalid percentage ${s.percentage}%. Must be between 0 and 100%`);
    }
    totalPercentage += s.percentage;
  }

  // Total percentage must be 100% (allowing small float precision epsilon of 0.01%)
  if (Math.abs(totalPercentage - 100) > 0.01) {
    throw new ValidationError(
      `Total percentage must equal 100%. Current sum: ${totalPercentage.toFixed(2)}%`
    );
  }

  // Calculate base minor units and fractional remainders (Largest Remainder Method)
  const calculated = splits.map((s, index) => {
    // Exact paise = totalAmount * percentage / 100
    const exactPaise = (totalAmount * s.percentage) / 100;
    const basePaise = Math.floor(exactPaise);
    const fraction = exactPaise - basePaise;

    return {
      userId: s.userId,
      percentage: s.percentage,
      basePaise,
      fraction,
      index,
    };
  });

  const baseSum = calculated.reduce((sum, item) => sum + item.basePaise, 0);
  let remainderPaise = totalAmount - baseSum;

  // Sort descending by fraction to distribute remainder paise deterministically
  const sorted = [...calculated].sort((a, b) => b.fraction - a.fraction);

  for (let i = 0; i < remainderPaise && i < sorted.length; i++) {
    sorted[i].basePaise += 1;
  }

  // Restore original order
  sorted.sort((a, b) => a.index - b.index);

  return sorted.map((item) => ({
    userId: item.userId,
    amount: item.basePaise,
    percentage: item.percentage,
  }));
}
