import { describe, it, expect } from 'vitest';
import { reconcileBalances, reconciledToMemberBalances } from './balance.reconciliation';
import { GroupBalanceSummary } from './balance.types';
import { SettlementRow } from '../../db/types';

describe('Balance Reconciliation', () => {
  const baseSummary: GroupBalanceSummary = {
    groupId: 'grp-1',
    totalExpensesCount: 1,
    totalExpensesAmount: 3000,
    creditors: [
      {
        userId: 'alice',
        displayName: 'Alice',
        paidAmount: 3000,
        owedAmount: 1000,
        netBalance: 2000,
        category: 'creditor',
      },
    ],
    debtors: [
      {
        userId: 'bob',
        displayName: 'Bob',
        paidAmount: 0,
        owedAmount: 1200,
        netBalance: -1200,
        category: 'debtor',
      },
      {
        userId: 'charlie',
        displayName: 'Charlie',
        paidAmount: 0,
        owedAmount: 800,
        netBalance: -800,
        category: 'debtor',
      },
    ],
    settled: [],
    allBalances: [
      {
        userId: 'alice',
        displayName: 'Alice',
        paidAmount: 3000,
        owedAmount: 1000,
        netBalance: 2000,
        category: 'creditor',
      },
      {
        userId: 'bob',
        displayName: 'Bob',
        paidAmount: 0,
        owedAmount: 1200,
        netBalance: -1200,
        category: 'debtor',
      },
      {
        userId: 'charlie',
        displayName: 'Charlie',
        paidAmount: 0,
        owedAmount: 800,
        netBalance: -800,
        category: 'debtor',
      },
    ],
  };

  it('returns unchanged balances when there are no settlements', () => {
    const result = reconcileBalances(baseSummary, []);

    expect(result.totalPaymentsCount).toBe(0);
    expect(result.totalPaymentsAmount).toBe(0);
    expect(result.creditors.length).toBe(1);
    expect(result.creditors[0].outstandingNet).toBe(2000);
    expect(result.debtors.length).toBe(2);
    expect(result.settled.length).toBe(0);
  });

  it('correctly updates balances when a member pays full debt', () => {
    const settlements: SettlementRow[] = [
      {
        id: 's-1',
        group_id: 'grp-1',
        from_user_id: 'bob',
        to_user_id: 'alice',
        amount: 1200,
        currency: 'INR',
        status: 'paid',
        created_by: 'bob',
        settled_at: '2026-09-19T10:00:00Z',
        created_at: '2026-09-19T10:00:00Z',
      },
    ];

    const result = reconcileBalances(baseSummary, settlements);

    expect(result.totalPaymentsCount).toBe(1);
    expect(result.totalPaymentsAmount).toBe(1200);

    // Bob paid 1200 -> rawBalance -1200 + 1200 = 0 -> settled!
    const bob = result.allBalances.find((m) => m.userId === 'bob')!;
    expect(bob.rawBalance).toBe(-1200);
    expect(bob.paymentsMade).toBe(1200);
    expect(bob.paymentsReceived).toBe(0);
    expect(bob.outstandingNet).toBe(0);
    expect(bob.category).toBe('settled');

    // Alice received 1200 -> rawBalance 2000 - 1200 = 800 -> creditor!
    const alice = result.allBalances.find((m) => m.userId === 'alice')!;
    expect(alice.rawBalance).toBe(2000);
    expect(alice.paymentsMade).toBe(0);
    expect(alice.paymentsReceived).toBe(1200);
    expect(alice.outstandingNet).toBe(800);
    expect(alice.category).toBe('creditor');

    // Charlie had no settlements -> unchanged
    const charlie = result.allBalances.find((m) => m.userId === 'charlie')!;
    expect(charlie.outstandingNet).toBe(-800);
    expect(charlie.category).toBe('debtor');

    // Settled list contains Bob
    expect(result.settled.map((m) => m.userId)).toEqual(['bob']);
    expect(result.creditors.map((m) => m.userId)).toEqual(['alice']);
    expect(result.debtors.map((m) => m.userId)).toEqual(['charlie']);
  });

  it('correctly handles partial repayments', () => {
    const settlements: SettlementRow[] = [
      {
        id: 's-1',
        group_id: 'grp-1',
        from_user_id: 'bob',
        to_user_id: 'alice',
        amount: 500,
        currency: 'INR',
        status: 'paid',
        created_by: 'bob',
        settled_at: '2026-09-19T10:00:00Z',
        created_at: '2026-09-19T10:00:00Z',
      },
    ];

    const result = reconcileBalances(baseSummary, settlements);

    const bob = result.allBalances.find((m) => m.userId === 'bob')!;
    expect(bob.outstandingNet).toBe(-700); // -1200 + 500 = -700
    expect(bob.category).toBe('debtor');

    const alice = result.allBalances.find((m) => m.userId === 'alice')!;
    expect(alice.outstandingNet).toBe(1500); // 2000 - 500 = 1500
    expect(alice.category).toBe('creditor');

    expect(result.debtors.length).toBe(2); // Charlie (-800) and Bob (-700)
    expect(result.settled.length).toBe(0);
  });

  it('ignores pending and cancelled settlements', () => {
    const settlements: SettlementRow[] = [
      {
        id: 's-1',
        group_id: 'grp-1',
        from_user_id: 'bob',
        to_user_id: 'alice',
        amount: 1200,
        currency: 'INR',
        status: 'pending',
        created_by: 'bob',
        settled_at: null,
        created_at: '2026-09-19T10:00:00Z',
      },
      {
        id: 's-2',
        group_id: 'grp-1',
        from_user_id: 'charlie',
        to_user_id: 'alice',
        amount: 800,
        currency: 'INR',
        status: 'cancelled',
        created_by: 'charlie',
        settled_at: null,
        created_at: '2026-09-19T10:00:00Z',
      },
    ];

    const result = reconcileBalances(baseSummary, settlements);

    expect(result.totalPaymentsCount).toBe(0);
    expect(result.totalPaymentsAmount).toBe(0);
    const bob = result.allBalances.find((m) => m.userId === 'bob')!;
    expect(bob.outstandingNet).toBe(-1200);
    const alice = result.allBalances.find((m) => m.userId === 'alice')!;
    expect(alice.outstandingNet).toBe(2000);
  });

  it('adapts reconciled balances to member balances correctly', () => {
    const settlements: SettlementRow[] = [
      {
        id: 's-1',
        group_id: 'grp-1',
        from_user_id: 'bob',
        to_user_id: 'alice',
        amount: 1200,
        currency: 'INR',
        status: 'paid',
        created_by: 'bob',
        settled_at: '2026-09-19T10:00:00Z',
        created_at: '2026-09-19T10:00:00Z',
      },
    ];

    const reconciled = reconcileBalances(baseSummary, settlements);
    const memberBalances = reconciledToMemberBalances(reconciled);

    const bob = memberBalances.find((m) => m.userId === 'bob')!;
    expect(bob.netBalance).toBe(0);
    expect(bob.category).toBe('settled');

    const alice = memberBalances.find((m) => m.userId === 'alice')!;
    expect(alice.netBalance).toBe(800);
    expect(alice.category).toBe('creditor');
  });
});
