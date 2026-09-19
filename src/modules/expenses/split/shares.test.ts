import { describe, it, expect } from 'vitest';
import { calculateSharesSplit } from './shares';
import { ValidationError } from '../../../shared/errors';

describe('calculateSharesSplit', () => {
  it('correctly splits ₹3000 (300000 paise) with 2:1:1 share ratio', () => {
    // Total = ₹3000, Dev = 2, Rahul = 1, Aman = 1 -> Dev = ₹1500, Rahul = ₹750, Aman = ₹750
    const totalPaise = 300000;
    const participants = [
      { userId: 'dev', shares: 2 },
      { userId: 'rahul', shares: 1 },
      { userId: 'aman', shares: 1 },
    ];

    const result = calculateSharesSplit(totalPaise, participants);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ userId: 'dev', amount: 150000, shares: 2 });
    expect(result[1]).toEqual({ userId: 'rahul', amount: 75000, shares: 1 });
    expect(result[2]).toEqual({ userId: 'aman', amount: 75000, shares: 1 });

    const total = result.reduce((sum, r) => sum + r.amount, 0);
    expect(total).toBe(totalPaise);
  });

  it('correctly splits with a 2:1 share ratio', () => {
    const totalPaise = 3000; // ₹30.00
    const participants = [
      { userId: 'alice', shares: 2 },
      { userId: 'bob', shares: 1 },
    ];

    const result = calculateSharesSplit(totalPaise, participants);

    expect(result).toEqual([
      { userId: 'alice', amount: 2000, shares: 2 },
      { userId: 'bob', amount: 1000, shares: 1 },
    ]);
    expect(result[0].amount + result[1].amount).toBe(totalPaise);
  });

  it('handles uneven total with deterministic rounding for 2:1 ratio', () => {
    // 1000 paise (₹10.00) with 2:1 shares
    // Alice: (1000 * 2) / 3 = 666, rem = 2
    // Bob: (1000 * 1) / 3 = 333, rem = 1
    // Unallocated = 1000 - 999 = 1 paise
    // Alice has higher remainder (2 > 1), so Alice gets the +1 paise
    const totalPaise = 1000;
    const participants = [
      { userId: 'alice', shares: 2 },
      { userId: 'bob', shares: 1 },
    ];

    const result = calculateSharesSplit(totalPaise, participants);

    expect(result[0]).toEqual({ userId: 'alice', amount: 667, shares: 2 });
    expect(result[1]).toEqual({ userId: 'bob', amount: 333, shares: 1 });
    expect(result[0].amount + result[1].amount).toBe(totalPaise);
  });

  it('handles uneven total with equal shares (tie breaking by original index)', () => {
    // 1000 paise split 1:1:1 among 3 participants
    // Base: 333 paise each. Remainder: 1 paise. First participant receives the +1 paise.
    const totalPaise = 1000;
    const participants = [
      { userId: 'user1', shares: 1 },
      { userId: 'user2', shares: 1 },
      { userId: 'user3', shares: 1 },
    ];

    const result = calculateSharesSplit(totalPaise, participants);

    expect(result[0]).toEqual({ userId: 'user1', amount: 334, shares: 1 });
    expect(result[1]).toEqual({ userId: 'user2', amount: 333, shares: 1 });
    expect(result[2]).toEqual({ userId: 'user3', amount: 333, shares: 1 });
    expect(result.reduce((s, r) => s + r.amount, 0)).toBe(totalPaise);
  });

  it('handles single participant with any number of shares', () => {
    const totalPaise = 54321;
    const single1 = calculateSharesSplit(totalPaise, [{ userId: 'solo', shares: 1 }]);
    expect(single1).toEqual([{ userId: 'solo', amount: 54321, shares: 1 }]);

    const single5 = calculateSharesSplit(totalPaise, [{ userId: 'solo', shares: 5 }]);
    expect(single5).toEqual([{ userId: 'solo', amount: 54321, shares: 5 }]);
  });

  it('handles large share ratios (e.g. 100:1)', () => {
    const totalPaise = 10100; // 101 shares -> each share is exactly 100 paise
    const participants = [
      { userId: 'whale', shares: 100 },
      { userId: 'minnow', shares: 1 },
    ];

    const result = calculateSharesSplit(totalPaise, participants);

    expect(result[0]).toEqual({ userId: 'whale', amount: 10000, shares: 100 });
    expect(result[1]).toEqual({ userId: 'minnow', amount: 100, shares: 1 });
    expect(result[0].amount + result[1].amount).toBe(totalPaise);
  });

  it('rejects invalid zero shares', () => {
    expect(() =>
      calculateSharesSplit(1000, [
        { userId: 'alice', shares: 0 },
        { userId: 'bob', shares: 1 },
      ])
    ).toThrow(ValidationError);
  });

  it('rejects negative shares', () => {
    expect(() =>
      calculateSharesSplit(1000, [
        { userId: 'alice', shares: -2 },
        { userId: 'bob', shares: 1 },
      ])
    ).toThrow(ValidationError);
  });

  it('rejects decimal shares', () => {
    expect(() =>
      calculateSharesSplit(1000, [
        { userId: 'alice', shares: 1.5 },
        { userId: 'bob', shares: 1 },
      ])
    ).toThrow(ValidationError);
  });

  it('rejects empty participants list', () => {
    expect(() => calculateSharesSplit(1000, [])).toThrow(ValidationError);
  });

  it('rejects non-positive total amount', () => {
    expect(() => calculateSharesSplit(0, [{ userId: 'a', shares: 1 }])).toThrow(ValidationError);
    expect(() => calculateSharesSplit(-500, [{ userId: 'a', shares: 1 }])).toThrow(ValidationError);
  });

  it('rejects float total amount', () => {
    expect(() => calculateSharesSplit(100.5, [{ userId: 'a', shares: 1 }])).toThrow(ValidationError);
  });

  it('satisfies sum invariant across various totals and arbitrary share combinations', () => {
    const testCases = [
      { total: 1, shares: [1, 1] },
      { total: 2, shares: [1, 1, 1] },
      { total: 7, shares: [2, 3, 5] },
      { total: 99999, shares: [3, 7, 11, 13] },
      { total: 1234567, shares: [1, 2, 3, 4, 5, 6, 7] },
      { total: 50, shares: [10, 20, 30] },
      { total: 1000000, shares: [1, 999] },
    ];

    for (const tc of testCases) {
      const participants = tc.shares.map((s, idx) => ({
        userId: `user_${idx}`,
        shares: s,
      }));

      const res = calculateSharesSplit(tc.total, participants);
      const sum = res.reduce((acc, r) => acc + r.amount, 0);

      expect(sum).toBe(tc.total);
      for (const r of res) {
        expect(r.amount).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(r.amount)).toBe(true);
      }
    }
  });
});
