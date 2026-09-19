import { describe, it, expect } from 'vitest';
import { calculateGroupBalances, MemberIdentity } from './balance.calculator';
import { ExpenseWithSplits } from '../../db/repositories/expenses.repository';
import { ValidationError } from '../../shared/errors';
import { SplitType } from '../../db/types';

function createMockExpense(
  id: string,
  paidBy: string,
  totalAmount: number,
  splits: { userId: string; amount: number; percentage?: number | null; shares?: number | null }[],
  options: { deletedAt?: string | null; splitType?: SplitType; description?: string } = {}
): ExpenseWithSplits {
  return {
    id,
    group_id: 'grp-1',
    paid_by: paidBy,
    created_by: paidBy,
    total_amount: totalAmount,
    description: options.description || 'Test Expense',
    category: 'general',
    currency: 'INR',
    expense_date: '2026-09-19',
    split_type: options.splitType || 'equal',
    deleted_at: options.deletedAt ?? null,
    created_at: '2026-09-19T10:00:00Z',
    updated_at: '2026-09-19T10:00:00Z',
    splits: splits.map((s, idx) => ({
      id: `s-${id}-${idx}`,
      expense_id: id,
      user_id: s.userId,
      amount: s.amount,
      percentage: s.percentage ?? null,
      shares: s.shares ?? null,
      created_at: '2026-09-19T10:00:00Z',
    })),
  };
}

describe('Balance Calculator (Pure Domain Logic)', () => {
  const members: MemberIdentity[] = [
    { userId: 'u-alice', displayName: 'Alice' },
    { userId: 'u-bob', displayName: 'Bob' },
    { userId: 'u-charlie', displayName: 'Charlie' },
  ];

  it('calculates zero balances for empty group with no expenses', () => {
    const summary = calculateGroupBalances('grp-1', members, []);

    expect(summary.groupId).toBe('grp-1');
    expect(summary.totalExpensesCount).toBe(0);
    expect(summary.totalExpensesAmount).toBe(0);
    expect(summary.creditors).toHaveLength(0);
    expect(summary.debtors).toHaveLength(0);
    expect(summary.settled).toHaveLength(3);

    for (const member of summary.settled) {
      expect(member.paidAmount).toBe(0);
      expect(member.owedAmount).toBe(0);
      expect(member.netBalance).toBe(0);
      expect(member.category).toBe('settled');
    }
  });

  it('calculates correct net balances for a single equal split expense', () => {
    const expenses = [
      createMockExpense('exp-1', 'u-alice', 30000, [
        { userId: 'u-alice', amount: 10000 },
        { userId: 'u-bob', amount: 10000 },
        { userId: 'u-charlie', amount: 10000 },
      ]),
    ];

    const summary = calculateGroupBalances('grp-1', members, expenses);

    expect(summary.totalExpensesCount).toBe(1);
    expect(summary.totalExpensesAmount).toBe(30000);

    expect(summary.creditors).toHaveLength(1);
    expect(summary.creditors[0]).toEqual({
      userId: 'u-alice',
      displayName: 'Alice',
      paidAmount: 30000,
      owedAmount: 10000,
      netBalance: 20000,
      category: 'creditor',
    });

    expect(summary.debtors).toHaveLength(2);
    expect(summary.debtors.find((d) => d.userId === 'u-bob')).toEqual({
      userId: 'u-bob',
      displayName: 'Bob',
      paidAmount: 0,
      owedAmount: 10000,
      netBalance: -10000,
      category: 'debtor',
    });
    expect(summary.debtors.find((d) => d.userId === 'u-charlie')).toEqual({
      userId: 'u-charlie',
      displayName: 'Charlie',
      paidAmount: 0,
      owedAmount: 10000,
      netBalance: -10000,
      category: 'debtor',
    });

    expect(summary.settled).toHaveLength(0);
    const netSum = summary.allBalances.reduce((sum, m) => sum + m.netBalance, 0);
    expect(netSum).toBe(0);
  });

  it('calculates multiple expenses with different payers and a settled member', () => {
    const expenses = [
      createMockExpense('exp-1', 'u-alice', 30000, [
        { userId: 'u-alice', amount: 10000 },
        { userId: 'u-bob', amount: 10000 },
        { userId: 'u-charlie', amount: 10000 },
      ]),
      createMockExpense('exp-2', 'u-bob', 15000, [
        { userId: 'u-alice', amount: 5000 },
        { userId: 'u-bob', amount: 5000 },
        { userId: 'u-charlie', amount: 5000 },
      ]),
    ];

    const summary = calculateGroupBalances('grp-1', members, expenses);

    expect(summary.totalExpensesCount).toBe(2);
    expect(summary.totalExpensesAmount).toBe(45000);

    // Alice: paid 30000, owed 15000 -> net +15000 (creditor)
    expect(summary.creditors).toHaveLength(1);
    expect(summary.creditors[0].userId).toBe('u-alice');
    expect(summary.creditors[0].netBalance).toBe(15000);

    // Charlie: paid 0, owed 15000 -> net -15000 (debtor)
    expect(summary.debtors).toHaveLength(1);
    expect(summary.debtors[0].userId).toBe('u-charlie');
    expect(summary.debtors[0].netBalance).toBe(-15000);

    // Bob: paid 15000, owed 15000 -> net 0 (settled)
    expect(summary.settled).toHaveLength(1);
    expect(summary.settled[0].userId).toBe('u-bob');
    expect(summary.settled[0].netBalance).toBe(0);

    const netSum = summary.allBalances.reduce((sum, m) => sum + m.netBalance, 0);
    expect(netSum).toBe(0);
  });

  it('handles mixed split types (equal, custom, percentage, shares)', () => {
    const expenses = [
      createMockExpense('exp-eq', 'u-alice', 10000, [
        { userId: 'u-alice', amount: 3334 },
        { userId: 'u-bob', amount: 3333 },
        { userId: 'u-charlie', amount: 3333 },
      ], { splitType: 'equal' }),
      createMockExpense('exp-cust', 'u-bob', 5000, [
        { userId: 'u-alice', amount: 2000 },
        { userId: 'u-bob', amount: 3000 },
      ], { splitType: 'custom' }),
      createMockExpense('exp-pct', 'u-charlie', 20000, [
        { userId: 'u-alice', amount: 10000, percentage: 50 },
        { userId: 'u-bob', amount: 6000, percentage: 30 },
        { userId: 'u-charlie', amount: 4000, percentage: 20 },
      ], { splitType: 'percentage' }),
      createMockExpense('exp-sh', 'u-alice', 10000, [
        { userId: 'u-alice', amount: 2500, shares: 1 },
        { userId: 'u-bob', amount: 7500, shares: 3 },
      ], { splitType: 'shares' }),
    ];

    const summary = calculateGroupBalances('grp-1', members, expenses);

    expect(summary.totalExpensesCount).toBe(4);
    expect(summary.totalExpensesAmount).toBe(45000);

    const alice = summary.allBalances.find((b) => b.userId === 'u-alice')!;
    expect(alice.paidAmount).toBe(20000);
    expect(alice.owedAmount).toBe(17834);
    expect(alice.netBalance).toBe(2166);
    expect(alice.category).toBe('creditor');

    const bob = summary.allBalances.find((b) => b.userId === 'u-bob')!;
    expect(bob.paidAmount).toBe(5000);
    expect(bob.owedAmount).toBe(19833);
    expect(bob.netBalance).toBe(-14833);
    expect(bob.category).toBe('debtor');

    const charlie = summary.allBalances.find((b) => b.userId === 'u-charlie')!;
    expect(charlie.paidAmount).toBe(20000);
    expect(charlie.owedAmount).toBe(7333);
    expect(charlie.netBalance).toBe(12667);
    expect(charlie.category).toBe('creditor');

    expect(alice.netBalance + bob.netBalance + charlie.netBalance).toBe(0);
  });

  it('handles case where payer is not a participant in the split', () => {
    const expenses = [
      createMockExpense('exp-gift', 'u-alice', 10000, [
        { userId: 'u-bob', amount: 5000 },
        { userId: 'u-charlie', amount: 5000 },
      ]),
    ];

    const summary = calculateGroupBalances('grp-1', members, expenses);

    const alice = summary.allBalances.find((m) => m.userId === 'u-alice')!;
    expect(alice.paidAmount).toBe(10000);
    expect(alice.owedAmount).toBe(0);
    expect(alice.netBalance).toBe(10000);

    const bob = summary.allBalances.find((m) => m.userId === 'u-bob')!;
    expect(bob.paidAmount).toBe(0);
    expect(bob.owedAmount).toBe(5000);
    expect(bob.netBalance).toBe(-5000);

    const charlie = summary.allBalances.find((m) => m.userId === 'u-charlie')!;
    expect(charlie.paidAmount).toBe(0);
    expect(charlie.owedAmount).toBe(5000);
    expect(charlie.netBalance).toBe(-5000);
  });

  it('preserves non-participating member with 0 balance as settled', () => {
    const extendedMembers = [...members, { userId: 'u-dan', displayName: 'Dan' }];
    const expenses = [
      createMockExpense('exp-1', 'u-alice', 6000, [
        { userId: 'u-alice', amount: 3000 },
        { userId: 'u-bob', amount: 3000 },
      ]),
    ];

    const summary = calculateGroupBalances('grp-1', extendedMembers, expenses);

    const dan = summary.allBalances.find((m) => m.userId === 'u-dan')!;
    expect(dan.paidAmount).toBe(0);
    expect(dan.owedAmount).toBe(0);
    expect(dan.netBalance).toBe(0);
    expect(dan.category).toBe('settled');
  });

  it('completely ignores soft-deleted expenses', () => {
    const expenses = [
      createMockExpense('exp-active', 'u-alice', 4000, [
        { userId: 'u-alice', amount: 2000 },
        { userId: 'u-bob', amount: 2000 },
      ]),
      createMockExpense('exp-deleted', 'u-bob', 100000, [
        { userId: 'u-alice', amount: 50000 },
        { userId: 'u-bob', amount: 50000 },
      ], { deletedAt: '2026-09-19T12:00:00Z' }),
    ];

    const summary = calculateGroupBalances('grp-1', members, expenses);

    expect(summary.totalExpensesCount).toBe(1);
    expect(summary.totalExpensesAmount).toBe(4000);

    const alice = summary.allBalances.find((m) => m.userId === 'u-alice')!;
    expect(alice.paidAmount).toBe(4000);
    expect(alice.owedAmount).toBe(2000);
    expect(alice.netBalance).toBe(2000);
  });

  it('throws ValidationError when expense split sum does not match total_amount', () => {
    const corruptExpenses = [
      createMockExpense('exp-corrupt', 'u-alice', 10000, [
        { userId: 'u-alice', amount: 5000 },
        { userId: 'u-bob', amount: 4999 }, // 9999 !== 10000
      ]),
    ];

    expect(() => calculateGroupBalances('grp-1', members, corruptExpenses)).toThrow(ValidationError);
    expect(() => calculateGroupBalances('grp-1', members, corruptExpenses)).toThrow(
      /Expense split sum mismatch/
    );
  });

  it('sorts creditors descending by amount, debtors ascending by amount, and settles alphabetically', () => {
    const fourMembers: MemberIdentity[] = [
      { userId: 'u-1', displayName: 'Zara' },
      { userId: 'u-2', displayName: 'Amy' },
      { userId: 'u-3', displayName: 'Dev' },
      { userId: 'u-4', displayName: 'Ben' },
    ];

    const expenses = [
      createMockExpense('exp-1', 'u-1', 10000, [{ userId: 'u-2', amount: 10000 }], { splitType: 'custom' }),
      createMockExpense('exp-2', 'u-3', 20000, [{ userId: 'u-4', amount: 20000 }], { splitType: 'custom' }),
    ];

    const summary = calculateGroupBalances('grp-1', fourMembers, expenses);

    expect(summary.creditors.map((c) => c.displayName)).toEqual(['Dev', 'Zara']);
    expect(summary.debtors.map((d) => d.displayName)).toEqual(['Ben', 'Amy']);
  });

  it('tie-breaks equal balances alphabetically by display name', () => {
    const tiedMembers: MemberIdentity[] = [
      { userId: 'u-zara', displayName: 'Zara' },
      { userId: 'u-amy', displayName: 'Amy' },
      { userId: 'u-bob', displayName: 'Bob' },
      { userId: 'u-dan', displayName: 'Dan' },
    ];

    const expenses = [
      createMockExpense('exp-1', 'u-zara', 5000, [{ userId: 'u-dan', amount: 5000 }], { splitType: 'custom' }),
      createMockExpense('exp-2', 'u-amy', 5000, [{ userId: 'u-bob', amount: 5000 }], { splitType: 'custom' }),
    ];

    const summary = calculateGroupBalances('grp-1', tiedMembers, expenses);

    expect(summary.creditors.map((c) => c.displayName)).toEqual(['Amy', 'Zara']);
    expect(summary.debtors.map((d) => d.displayName)).toEqual(['Bob', 'Dan']);
  });

  it('gracefully includes payer not in initial members list to guarantee conservation invariant', () => {
    const partialMembers: MemberIdentity[] = [{ userId: 'u-alice', displayName: 'Alice' }];
    const expenses = [
      createMockExpense('exp-ext', 'u-external-payer', 5000, [{ userId: 'u-alice', amount: 5000 }], { splitType: 'custom' }),
    ];

    const summary = calculateGroupBalances('grp-1', partialMembers, expenses);

    const netSum = summary.allBalances.reduce((sum, m) => sum + m.netBalance, 0);
    expect(netSum).toBe(0);
    expect(summary.creditors[0].userId).toBe('u-external-payer');
    expect(summary.debtors[0].userId).toBe('u-alice');
  });
});
