import { describe, it, expect } from 'vitest';
import { calculateEqualSplit } from './equal';
import { ValidationError } from '../../../shared/errors';

describe('Equal Split Calculation', () => {
  it('divides amount equally when divisible with zero remainder', () => {
    // ₹24.00 (2400 paise) split among 4 participants = 600 paise each
    const splits = calculateEqualSplit(2400, ['u1', 'u2', 'u3', 'u4']);

    expect(splits).toHaveLength(4);
    expect(splits.map((s) => s.amount)).toEqual([600, 600, 600, 600]);
    const sum = splits.reduce((acc, s) => acc + s.amount, 0);
    expect(sum).toBe(2400);
  });

  it('deterministically distributes remainder paise without losing money', () => {
    // ₹1.00 (100 paise) split among 3 participants:
    // 100 / 3 = 33 base, remainder 1
    // First participant gets 34, other two get 33
    const splits = calculateEqualSplit(100, ['u1', 'u2', 'u3']);

    expect(splits).toHaveLength(3);
    expect(splits[0].amount).toBe(34);
    expect(splits[1].amount).toBe(33);
    expect(splits[2].amount).toBe(33);

    const sum = splits.reduce((acc, s) => acc + s.amount, 0);
    expect(sum).toBe(100);
  });

  it('distributes multiple remainder paise correctly', () => {
    // ₹10.02 (1002 paise) split among 4 participants:
    // 1002 / 4 = 250 base, remainder 2
    // First 2 get 251, remaining 2 get 250
    const splits = calculateEqualSplit(1002, ['u1', 'u2', 'u3', 'u4']);

    expect(splits.map((s) => s.amount)).toEqual([251, 251, 250, 250]);
    const sum = splits.reduce((acc, s) => acc + s.amount, 0);
    expect(sum).toBe(1002);
  });

  it('throws ValidationError for zero participants', () => {
    expect(() => calculateEqualSplit(1000, [])).toThrow(ValidationError);
  });

  it('throws ValidationError for non-integer or non-positive amount', () => {
    expect(() => calculateEqualSplit(0, ['u1'])).toThrow(ValidationError);
    expect(() => calculateEqualSplit(-500, ['u1'])).toThrow(ValidationError);
    expect(() => calculateEqualSplit(10.5, ['u1'])).toThrow(ValidationError);
  });
});
