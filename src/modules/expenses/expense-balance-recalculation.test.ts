import { describe, it, expect, vi } from 'vitest';
import { BalanceService } from '../balances/balance.service';
import { SettlementService } from '../settlements/settlement.service';
import { ExpenseRepository, ExpenseWithSplits } from '../../db/repositories/expenses.repository';
import { GroupRepository } from '../../db/repositories/groups.repository';
import { GroupMemberRepository } from '../../db/repositories/group-members.repository';
import { UserRepository } from '../../db/repositories/users.repository';
import { SettlementRepository } from '../../db/repositories/settlements.repository';

describe('Expense Soft-Deletion & Balance/Settlement Recalculation', () => {
  it('automatically recalculates balances and settlement recommendations when an expense is soft-deleted', async () => {
    // Member identities
    const aliceId = 'usr-alice';
    const bobId = 'usr-bob';
    const charlieId = 'usr-charlie';
    const groupId = 'grp-1';

    const expense1: ExpenseWithSplits = {
      id: 'exp-1',
      group_id: groupId,
      description: 'Dinner',
      category: 'food',
      total_amount: 3000, // ₹30.00
      currency: 'INR',
      paid_by: aliceId,
      created_by: aliceId,
      split_type: 'equal',
      expense_date: '2026-09-19T10:00:00Z',
      created_at: '2026-09-19T10:00:00Z',
      updated_at: '2026-09-19T10:00:00Z',
      deleted_at: null,
      splits: [
        { id: 's-1', expense_id: 'exp-1', user_id: aliceId, amount: 1000, percentage: null, shares: null, created_at: '' },
        { id: 's-2', expense_id: 'exp-1', user_id: bobId, amount: 1000, percentage: null, shares: null, created_at: '' },
        { id: 's-3', expense_id: 'exp-1', user_id: charlieId, amount: 1000, percentage: null, shares: null, created_at: '' },
      ],
    };

    const expense2: ExpenseWithSplits = {
      id: 'exp-2',
      group_id: groupId,
      description: 'Taxi',
      category: 'transport',
      total_amount: 1500, // ₹15.00
      currency: 'INR',
      paid_by: bobId,
      created_by: bobId,
      split_type: 'equal',
      expense_date: '2026-09-19T11:00:00Z',
      created_at: '2026-09-19T11:00:00Z',
      updated_at: '2026-09-19T11:00:00Z',
      deleted_at: null,
      splits: [
        { id: 's-4', expense_id: 'exp-2', user_id: aliceId, amount: 500, percentage: null, shares: null, created_at: '' },
        { id: 's-5', expense_id: 'exp-2', user_id: bobId, amount: 500, percentage: null, shares: null, created_at: '' },
        { id: 's-6', expense_id: 'exp-2', user_id: charlieId, amount: 500, percentage: null, shares: null, created_at: '' },
      ],
    };

    let activeExpenses = [expense1, expense2];

    const expenseRepo = {
      findActiveExpensesWithSplitsByGroupId: vi.fn().mockImplementation(async () => activeExpenses),
    } as unknown as ExpenseRepository;

    const groupRepo = {
      findById: vi.fn().mockResolvedValue({ id: groupId, title: 'Trip' }),
    } as unknown as GroupRepository;

    const groupMemberRepo = {
      findActiveMembersByGroupId: vi.fn().mockResolvedValue([
        { user_id: aliceId, display_name: 'Alice', is_active: true },
        { user_id: bobId, display_name: 'Bob', is_active: true },
        { user_id: charlieId, display_name: 'Charlie', is_active: true },
      ]),
      findByGroupAndUser: vi.fn().mockImplementation(async (_g, u) => ({
        user_id: u,
        display_name: u === aliceId ? 'Alice' : u === bobId ? 'Bob' : 'Charlie',
        is_active: true,
      })),
    } as unknown as GroupMemberRepository;

    const userRepo = {
      findById: vi.fn().mockImplementation(async (u) => ({
        id: u,
        first_name: u === aliceId ? 'Alice' : u === bobId ? 'Bob' : 'Charlie',
      })),
    } as unknown as UserRepository;

    const settlementRepo = {
      findPaidByGroupId: vi.fn().mockResolvedValue([]),
    } as unknown as SettlementRepository;

    const balanceService = new BalanceService(
      expenseRepo,
      groupRepo,
      groupMemberRepo,
      userRepo,
      settlementRepo
    );

    const settlementService = new SettlementService(
      balanceService,
      settlementRepo,
      groupRepo,
      groupMemberRepo,
      userRepo
    );

    // Initial calculation with both expenses
    const initialSummary = await balanceService.getGroupBalanceSummary(groupId);
    // Alice paid 3000, owed 1500 -> net +1500
    // Bob paid 1500, owed 1500 -> net 0
    // Charlie paid 0, owed 1500 -> net -1500
    const aliceInitial = initialSummary.allBalances.find((b) => b.userId === aliceId);
    const bobInitial = initialSummary.allBalances.find((b) => b.userId === bobId);
    const charlieInitial = initialSummary.allBalances.find((b) => b.userId === charlieId);

    expect(aliceInitial?.netBalance).toBe(1500);
    expect(bobInitial?.netBalance).toBe(0);
    expect(charlieInitial?.netBalance).toBe(-1500);

    const initialSettlement = await settlementService.getGroupSettlementPlan(groupId);
    expect(initialSettlement.transactions).toHaveLength(1);
    expect(initialSettlement.transactions[0]).toEqual(
      expect.objectContaining({
        fromUserId: charlieId,
        toUserId: aliceId,
        amount: 1500,
      })
    );

    // SOFT-DELETE expense1 ("Dinner")
    // Database query for active expenses filters out deleted_at IS NOT NULL
    activeExpenses = [expense2];

    // Re-calculate group balance: should only account for expense2 ("Taxi")
    const recalculatedSummary = await balanceService.getGroupBalanceSummary(groupId);
    // Taxi: 1500 paid by Bob, split 500 each among Alice, Bob, Charlie.
    // Alice: paid 0, owed 500 -> net -500
    // Bob: paid 1500, owed 500 -> net +1000
    // Charlie: paid 0, owed 500 -> net -500
    const aliceRecalc = recalculatedSummary.allBalances.find((b) => b.userId === aliceId);
    const bobRecalc = recalculatedSummary.allBalances.find((b) => b.userId === bobId);
    const charlieRecalc = recalculatedSummary.allBalances.find((b) => b.userId === charlieId);

    expect(aliceRecalc?.netBalance).toBe(-500);
    expect(bobRecalc?.netBalance).toBe(1000);
    expect(charlieRecalc?.netBalance).toBe(-500);

    // Recalculated settlement plan: Alice and Charlie pay Bob 500 each
    const recalculatedSettlement = await settlementService.getGroupSettlementPlan(groupId);
    expect(recalculatedSettlement.transactions).toHaveLength(2);
    expect(recalculatedSettlement.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromUserId: aliceId, toUserId: bobId, amount: 500 }),
        expect.objectContaining({ fromUserId: charlieId, toUserId: bobId, amount: 500 }),
      ])
    );
  });
});
