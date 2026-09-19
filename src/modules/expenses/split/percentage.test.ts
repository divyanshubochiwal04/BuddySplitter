import { describe, it, expect } from 'vitest';
import { calculatePercentageSplit } from './percentage';

describe('Percentage Split Calculation', () => {
  it('calculates exact percentage split without remainder', () => {
    // Total 10000 paise (₹100), 25% each across 4 participants
    const splits = calculatePercentageSplit(10000, [
      { userId: 'u1', percentage: 25 },
      { userId: 'u2', percentage: 25 },
      { userId: 'u3', percentage: 25 },
      { userId: 'u4', percentage: 25 },
    ]);

    expect(splits.map((s) => s.amount)).toEqual([2500, 2500, 2500, 2500]);
    const sum = splits.reduce((acc, s) => acc + s.amount, 0);
    expect(sum).toBe(10000);
  });

  it('deterministically rounds and distributes remainder paise using Largest Remainder Method', () => {
    // Total 100 paise (₹1.00), split 33.33%, 33.33%, 33.34%
    // 33.33 + 33.33 + 33.34 = 100%
    // 100 * 33.33% = 33.33 paise -> base 33, frac 0.33
    // 100 * 33.34% = 33.34 paise -> base 33, frac 0.34
    // Base sum = 99. Remainder = 1.
    // Frac 0.34 is largest -> u3 gets 34, others get 33
    const splits = calculatePercentageSplit(100, [
      { userId: 'u1', percentage: 33.33 },
      { userId: 'u2', percentage: 33.33 },
      { userId: 'u3', percentage: 33.34 },
    ]);

    expect(splits).toHaveLength(3);
    const sum = splits.reduce((acc, s) => acc + s.amount, 0);
    expect(sum).toBe(100);
    expect(splits[2].amount).toBe(34);
    expect(splits[0].amount).toBe(33);
    expect(splits[1].amount).toBe(33);
  });

  it('rejects percentage splits that do not sum to 100%', () => {
    // Sum = 90%
    expect(() =>
      calculatePercentageSplit(1000, [
        { userId: 'u1', percentage: 50 },
        { userId: 'u2', percentage: 40 },
      ])
    ).toThrow(/Total percentage must equal 100%/);

    // Sum = 110%
    expect(() =>
      calculatePercentageSplit(1000, [
        { userId: 'u1', percentage: 60 },
        { userId: 'u2', percentage: 50 },
      ])
    ).toThrow(/Total percentage must equal 100%/);
  });

  it('rejects negative percentage or percentage > 100', () => {
    expect(() =>
      calculatePercentageSplit(1000, [
        { userId: 'u1', percentage: -10 },
        { userId: 'u2', percentage: 110 },
      ])
    ).toThrow(/Must be between 0 and 100%/);
  });
});
