import { describe, it, expect, vi } from 'vitest';
import { SettlementService } from './settlement.service';
import { BalanceService } from '../balances/balance.service';
import { GroupBalanceSummary, UserPersonalBalance } from '../balances/balance.types';
import { NotFoundError, ValidationError } from '../../shared/errors';

describe('SettlementService', () => {
  const mockGroupSummary: GroupBalanceSummary = {
    groupId: 'grp-1',
    totalExpensesCount: 2,
    totalExpensesAmount: 30000,
    creditors: [
      {
        userId: 'u-alice',
        displayName: 'Alice',
        paidAmount: 30000,
        owedAmount: 10000,
        netBalance: 20000,
        category: 'creditor',
      },
    ],
    debtors: [
      {
        userId: 'u-bob',
        displayName: 'Bob',
        paidAmount: 0,
        owedAmount: 20000,
        netBalance: -20000,
        category: 'debtor',
      },
    ],
    settled: [],
    allBalances: [
      {
        userId: 'u-alice',
        displayName: 'Alice',
        paidAmount: 30000,
        owedAmount: 10000,
        netBalance: 20000,
        category: 'creditor',
      },
      {
        userId: 'u-bob',
        displayName: 'Bob',
        paidAmount: 0,
        owedAmount: 20000,
        netBalance: -20000,
        category: 'debtor',
      },
    ],
  };

  const mockUserBalance: UserPersonalBalance = {
    userId: 'u-bob',
    displayName: 'Bob',
    paidAmount: 0,
    owedAmount: 20000,
    netBalance: -20000,
    category: 'debtor',
  };

  const mockBalanceService = {
    getGroupBalanceSummary: vi.fn(),
    getUserBalanceInGroup: vi.fn(),
    getGroupSummaryForTelegram: vi.fn(),
    getUserBalanceForTelegram: vi.fn(),
  } as unknown as BalanceService;

  const service = new SettlementService(mockBalanceService);

  it('computes group settlement plan delegating to BalanceService', async () => {
    vi.mocked(mockBalanceService.getGroupBalanceSummary).mockResolvedValue(mockGroupSummary);

    const plan = await service.getGroupSettlementPlan('grp-1');

    expect(mockBalanceService.getGroupBalanceSummary).toHaveBeenCalledWith('grp-1');
    expect(plan.groupId).toBe('grp-1');
    expect(plan.transactions).toHaveLength(1);
    expect(plan.transactions[0]).toEqual({
      fromUserId: 'u-bob',
      fromDisplayName: 'Bob',
      toUserId: 'u-alice',
      toDisplayName: 'Alice',
      amount: 20000,
    });
  });

  it('computes user settlement summary for a specific user in a group', async () => {
    vi.mocked(mockBalanceService.getGroupBalanceSummary).mockResolvedValue(mockGroupSummary);

    const summary = await service.getUserSettlementSummary('grp-1', 'u-bob');

    expect(summary.userId).toBe('u-bob');
    expect(summary.displayName).toBe('Bob');
    expect(summary.payments).toHaveLength(1);
    expect(summary.payments[0].toDisplayName).toBe('Alice');
    expect(summary.totalToPay).toBe(20000);
    expect(summary.isSettled).toBe(false);
  });

  it('computes group settlement plan for Telegram with chat and member verification', async () => {
    vi.mocked(mockBalanceService.getGroupSummaryForTelegram).mockResolvedValue(mockGroupSummary);

    const plan = await service.getGroupSettlementPlanForTelegram(-1001, 111);

    expect(mockBalanceService.getGroupSummaryForTelegram).toHaveBeenCalledWith(-1001, 111);
    expect(plan.transactions).toHaveLength(1);
  });

  it('computes personal settlement summary and group plan for Telegram', async () => {
    vi.mocked(mockBalanceService.getGroupSummaryForTelegram).mockResolvedValue(mockGroupSummary);
    vi.mocked(mockBalanceService.getUserBalanceForTelegram).mockResolvedValue(mockUserBalance);

    const result = await service.getUserSettlementSummaryForTelegram(-1001, 111);

    expect(mockBalanceService.getGroupSummaryForTelegram).toHaveBeenCalledWith(-1001, 111);
    expect(mockBalanceService.getUserBalanceForTelegram).toHaveBeenCalledWith(-1001, 111);

    expect(result.userSummary.userId).toBe('u-bob');
    expect(result.userSummary.totalToPay).toBe(20000);
    expect(result.groupPlan.transactions).toHaveLength(1);
  });

  it('propagates NotFoundError if group is not found in Telegram verification', async () => {
    vi.mocked(mockBalanceService.getGroupSummaryForTelegram).mockRejectedValue(
      new NotFoundError('Group is not registered.')
    );

    await expect(service.getGroupSettlementPlanForTelegram(-999, 123)).rejects.toThrow(
      NotFoundError
    );
  });

  it('propagates ValidationError if user is not an active group member', async () => {
    vi.mocked(mockBalanceService.getGroupSummaryForTelegram).mockRejectedValue(
      new ValidationError('You must be an active member of this group.')
    );

    await expect(service.getUserSettlementSummaryForTelegram(-1001, 999)).rejects.toThrow(
      ValidationError
    );
  });
});
