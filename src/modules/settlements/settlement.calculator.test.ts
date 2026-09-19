import { describe, it, expect } from 'vitest';
import {
  calculateSettlements,
  calculateUserSettlementSummary,
} from './settlement.calculator';
import { MemberBalance } from '../balances/balance.types';
import { ValidationError } from '../../shared/errors';

function makeMember(
  userId: string,
  displayName: string,
  netBalance: number
): MemberBalance {
  return {
    userId,
    displayName,
    paidAmount: netBalance > 0 ? netBalance : 0,
    owedAmount: netBalance < 0 ? Math.abs(netBalance) : 0,
    netBalance,
    category: netBalance > 0 ? 'creditor' : netBalance < 0 ? 'debtor' : 'settled',
  };
}

describe('Settlement Calculator (Pure Domain Logic)', () => {
  it('handles empty balance set', () => {
    const plan = calculateSettlements('grp-1', []);
    expect(plan.groupId).toBe('grp-1');
    expect(plan.transactions).toHaveLength(0);
    expect(plan.totalAmount).toBe(0);
    expect(plan.totalPaymentsCount).toBe(0);
    expect(plan.isSettled).toBe(true);
  });

  it('handles fully balanced group where all members have netBalance === 0', () => {
    const balances = [
      makeMember('u-1', 'Alice', 0),
      makeMember('u-2', 'Bob', 0),
      makeMember('u-3', 'Charlie', 0),
    ];

    const plan = calculateSettlements('grp-1', balances);
    expect(plan.transactions).toHaveLength(0);
    expect(plan.totalAmount).toBe(0);
    expect(plan.isSettled).toBe(true);
  });

  it('handles one creditor and one debtor', () => {
    // Alice +₹100 (10000 paise), Bob -₹100 (-10000 paise)
    const balances = [
      makeMember('u-alice', 'Alice', 10000),
      makeMember('u-bob', 'Bob', -10000),
    ];

    const plan = calculateSettlements('grp-1', balances);
    expect(plan.transactions).toHaveLength(1);
    expect(plan.transactions[0]).toEqual({
      fromUserId: 'u-bob',
      fromDisplayName: 'Bob',
      toUserId: 'u-alice',
      toDisplayName: 'Alice',
      amount: 10000,
    });
    expect(plan.totalAmount).toBe(10000);
    expect(plan.totalPaymentsCount).toBe(1);
    expect(plan.isSettled).toBe(false);
  });

  it('handles one creditor and multiple debtors', () => {
    // Alice +₹3000 (300000 paise), Bob -₹1000 (-100000 paise), Charlie -₹2000 (-200000 paise)
    const balances = [
      makeMember('u-alice', 'Alice', 300000),
      makeMember('u-bob', 'Bob', -100000),
      makeMember('u-charlie', 'Charlie', -200000),
    ];

    const plan = calculateSettlements('grp-1', balances);
    expect(plan.transactions).toHaveLength(2);

    // Debtors sorted largest debt first: Charlie (200000) then Bob (100000)
    expect(plan.transactions[0]).toEqual({
      fromUserId: 'u-charlie',
      fromDisplayName: 'Charlie',
      toUserId: 'u-alice',
      toDisplayName: 'Alice',
      amount: 200000,
    });
    expect(plan.transactions[1]).toEqual({
      fromUserId: 'u-bob',
      fromDisplayName: 'Bob',
      toUserId: 'u-alice',
      toDisplayName: 'Alice',
      amount: 100000,
    });
    expect(plan.totalAmount).toBe(300000);
  });

  it('handles multiple creditors and one debtor', () => {
    // Alice +₹1000 (100000 paise), Bob +₹2000 (200000 paise), Charlie -₹3000 (-300000 paise)
    const balances = [
      makeMember('u-alice', 'Alice', 100000),
      makeMember('u-bob', 'Bob', 200000),
      makeMember('u-charlie', 'Charlie', -300000),
    ];

    const plan = calculateSettlements('grp-1', balances);
    expect(plan.transactions).toHaveLength(2);

    // Creditors sorted largest credit first: Bob (200000) then Alice (100000)
    expect(plan.transactions[0]).toEqual({
      fromUserId: 'u-charlie',
      fromDisplayName: 'Charlie',
      toUserId: 'u-bob',
      toDisplayName: 'Bob',
      amount: 200000,
    });
    expect(plan.transactions[1]).toEqual({
      fromUserId: 'u-charlie',
      fromDisplayName: 'Charlie',
      toUserId: 'u-alice',
      toDisplayName: 'Alice',
      amount: 100000,
    });
    expect(plan.totalAmount).toBe(300000);
  });

  it('handles multiple creditors and multiple debtors (specification example)', () => {
    // A +₹500 (50000 paise), B +₹300 (30000 paise), C -₹400 (-40000 paise), D -₹400 (-40000 paise)
    const balances = [
      makeMember('u-a', 'A', 50000),
      makeMember('u-b', 'B', 30000),
      makeMember('u-c', 'C', -40000),
      makeMember('u-d', 'D', -40000),
    ];

    const plan = calculateSettlements('grp-1', balances);
    expect(plan.transactions).toHaveLength(3);

    // Creditors: A (50000), B (30000)
    // Debtors: tie-break lexical -> C (40000), D (40000)
    // 1. C -> A 40000 (C satisfied, A has 10000 remaining)
    // 2. D -> A 10000 (A satisfied, D has 30000 remaining)
    // 3. D -> B 30000 (both D and B satisfied)
    expect(plan.transactions[0]).toEqual({
      fromUserId: 'u-c',
      fromDisplayName: 'C',
      toUserId: 'u-a',
      toDisplayName: 'A',
      amount: 40000,
    });
    expect(plan.transactions[1]).toEqual({
      fromUserId: 'u-d',
      fromDisplayName: 'D',
      toUserId: 'u-a',
      toDisplayName: 'A',
      amount: 10000,
    });
    expect(plan.transactions[2]).toEqual({
      fromUserId: 'u-d',
      fromDisplayName: 'D',
      toUserId: 'u-b',
      toDisplayName: 'B',
      amount: 30000,
    });

    expect(plan.totalAmount).toBe(80000);
  });

  it('handles exact equal balances matching perfectly', () => {
    // Alice +₹50, Bob +₹50, Charlie -₹50, Dave -₹50
    const balances = [
      makeMember('u-alice', 'Alice', 5000),
      makeMember('u-bob', 'Bob', 5000),
      makeMember('u-charlie', 'Charlie', -5000),
      makeMember('u-dave', 'Dave', -5000),
    ];

    const plan = calculateSettlements('grp-1', balances);
    expect(plan.transactions).toHaveLength(2);
    // Charlie -> Alice 5000, Dave -> Bob 5000
    expect(plan.transactions[0].amount).toBe(5000);
    expect(plan.transactions[1].amount).toBe(5000);
    expect(plan.totalAmount).toBe(10000);
  });

  it('handles uneven and prime paise amounts without rounding errors', () => {
    // A +3334, B -1667, C -1667
    const balances = [
      makeMember('u-a', 'A', 3334),
      makeMember('u-b', 'B', -1667),
      makeMember('u-c', 'C', -1667),
    ];

    const plan = calculateSettlements('grp-1', balances);
    expect(plan.transactions).toHaveLength(2);
    expect(plan.totalAmount).toBe(3334);
    expect(plan.transactions.reduce((s, tx) => s + tx.amount, 0)).toBe(3334);
  });

  it('handles large amounts accurately in integer minor units', () => {
    // 1 crore paise (₹100,000.00)
    const balances = [
      makeMember('u-1', 'Alice', 10000000),
      makeMember('u-2', 'Bob', -6000000),
      makeMember('u-3', 'Charlie', -4000000),
    ];

    const plan = calculateSettlements('grp-1', balances);
    expect(plan.totalAmount).toBe(10000000);
    expect(plan.transactions).toHaveLength(2);
  });

  it('handles 1-paisa minimal difference', () => {
    const balances = [
      makeMember('u-1', 'Alice', 1),
      makeMember('u-2', 'Bob', -1),
    ];

    const plan = calculateSettlements('grp-1', balances);
    expect(plan.transactions).toHaveLength(1);
    expect(plan.transactions[0].amount).toBe(1);
  });

  it('is completely deterministic regardless of input array ordering', () => {
    const balances1 = [
      makeMember('u-a', 'A', 5000),
      makeMember('u-b', 'B', 3000),
      makeMember('u-c', 'C', -4000),
      makeMember('u-d', 'D', -4000),
    ];

    // Shuffled input
    const balances2 = [
      makeMember('u-d', 'D', -4000),
      makeMember('u-a', 'A', 5000),
      makeMember('u-c', 'C', -4000),
      makeMember('u-b', 'B', 3000),
    ];

    const plan1 = calculateSettlements('grp-1', balances1);
    const plan2 = calculateSettlements('grp-1', balances2);

    expect(plan1.transactions).toEqual(plan2.transactions);
  });

  it('guarantees never generating self-payments (fromUserId !== toUserId)', () => {
    const balances = [
      makeMember('u-1', 'Alice', 2000),
      makeMember('u-2', 'Bob', 3000),
      makeMember('u-3', 'Charlie', -5000),
    ];

    const plan = calculateSettlements('grp-1', balances);
    for (const tx of plan.transactions) {
      expect(tx.fromUserId).not.toBe(tx.toUserId);
      expect(tx.amount).toBeGreaterThan(0);
    }
  });

  it('throws ValidationError if incoming balance vector does not conserve money', () => {
    const corruptBalances = [
      makeMember('u-1', 'Alice', 5000),
      makeMember('u-2', 'Bob', -4999), // sum = +1
    ];

    expect(() => calculateSettlements('grp-1', corruptBalances)).toThrow(ValidationError);
    expect(() => calculateSettlements('grp-1', corruptBalances)).toThrow(/conservation invariant failed/);
  });

  it('verifies that applying generated settlements reduces all member balances to exactly zero', () => {
    const complexBalances = [
      makeMember('u-1', 'User 1', 12345),
      makeMember('u-2', 'User 2', 67890),
      makeMember('u-3', 'User 3', -30000),
      makeMember('u-4', 'User 4', -40000),
      makeMember('u-5', 'User 5', -10235),
    ];

    const plan = calculateSettlements('grp-1', complexBalances);

    // Simulate settlement
    const simulated = new Map<string, number>();
    for (const b of complexBalances) {
      simulated.set(b.userId, b.netBalance);
    }

    for (const tx of plan.transactions) {
      simulated.set(tx.fromUserId, (simulated.get(tx.fromUserId) || 0) + tx.amount);
      simulated.set(tx.toUserId, (simulated.get(tx.toUserId) || 0) - tx.amount);
    }

    for (const remaining of simulated.values()) {
      expect(remaining).toBe(0);
    }
  });

  describe('calculateUserSettlementSummary', () => {
    it('derives user personal summary with both payments and receivables', () => {
      const plan = {
        groupId: 'grp-1',
        totalAmount: 2000,
        totalPaymentsCount: 2,
        isSettled: false,
        transactions: [
          { fromUserId: 'u-1', fromDisplayName: 'Me', toUserId: 'u-2', toDisplayName: 'Alice', amount: 1200 },
          { fromUserId: 'u-3', fromDisplayName: 'Bob', toUserId: 'u-1', toDisplayName: 'Me', amount: 800 },
        ],
      };

      const summary = calculateUserSettlementSummary('u-1', 'Me', plan);
      expect(summary.userId).toBe('u-1');
      expect(summary.displayName).toBe('Me');
      expect(summary.payments).toHaveLength(1);
      expect(summary.payments[0].toDisplayName).toBe('Alice');
      expect(summary.totalToPay).toBe(1200);

      expect(summary.receivables).toHaveLength(1);
      expect(summary.receivables[0].fromDisplayName).toBe('Bob');
      expect(summary.totalToReceive).toBe(800);

      expect(summary.netBalance).toBe(-400);
      expect(summary.isSettled).toBe(false);
    });

    it('derives user personal summary for settled member', () => {
      const plan = {
        groupId: 'grp-1',
        totalAmount: 1000,
        totalPaymentsCount: 1,
        isSettled: false,
        transactions: [
          { fromUserId: 'u-2', fromDisplayName: 'Bob', toUserId: 'u-3', toDisplayName: 'Charlie', amount: 1000 },
        ],
      };

      const summary = calculateUserSettlementSummary('u-1', 'Alice', plan);
      expect(summary.isSettled).toBe(true);
      expect(summary.payments).toHaveLength(0);
      expect(summary.receivables).toHaveLength(0);
      expect(summary.totalToPay).toBe(0);
      expect(summary.totalToReceive).toBe(0);
      expect(summary.netBalance).toBe(0);
    });
  });
});
