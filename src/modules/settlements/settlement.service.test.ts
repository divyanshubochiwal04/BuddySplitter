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

  describe('Payment Recording & History', () => {
    const mockSettlementRepo = {
      create: vi.fn(),
      findRecentPaidByGroupId: vi.fn(),
      findPaidByGroupId: vi.fn(),
      findById: vi.fn(),
      findByGroupId: vi.fn(),
      updateStatus: vi.fn(),
    };

    const mockGroupRepo = {
      findByTelegramChatId: vi.fn(),
    };

    const mockGroupMemberRepo = {
      findByGroupAndUser: vi.fn(),
    };

    const mockUserRepo = {
      findByTelegramId: vi.fn(),
      findById: vi.fn(),
    };

    const fullService = new SettlementService(
      mockBalanceService,
      mockSettlementRepo as any,
      mockGroupRepo as any,
      mockGroupMemberRepo as any,
      mockUserRepo as any
    );

    it('rejects recording payment when fromUserId equals toUserId', async () => {
      await expect(
        fullService.recordPayment({
          groupId: 'grp-1',
          fromUserId: 'u-1',
          toUserId: 'u-1',
          amount: 5000,
          createdBy: 'u-1',
        })
      ).rejects.toThrow('from_user_id cannot be the same as to_user_id');
    });

    it('rejects recording payment with invalid non-positive amount', async () => {
      await expect(
        fullService.recordPayment({
          groupId: 'grp-1',
          fromUserId: 'u-1',
          toUserId: 'u-2',
          amount: -100,
          createdBy: 'u-1',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects payment exceeding current debt with exact error message', async () => {
      vi.mocked(mockBalanceService.getGroupBalanceSummary).mockResolvedValue(mockGroupSummary);

      // In mockGroupSummary: Bob owes Alice 20000 paise (₹200.00). Trying to pay 25000 paise.
      await expect(
        fullService.recordPayment({
          groupId: 'grp-1',
          fromUserId: 'u-bob',
          toUserId: 'u-alice',
          amount: 25000,
          createdBy: 'u-bob',
        })
      ).rejects.toThrow('❌ Payment exceeds the current amount owed.');
    });

    it('records valid payment in repository', async () => {
      vi.mocked(mockBalanceService.getGroupBalanceSummary).mockResolvedValue(mockGroupSummary);
      const mockCreated = {
        id: 'set-100',
        group_id: 'grp-1',
        from_user_id: 'u-bob',
        to_user_id: 'u-alice',
        amount: 15000,
        currency: 'INR',
        status: 'paid',
        created_by: 'u-bob',
        settled_at: '2026-09-19T12:00:00Z',
        created_at: '2026-09-19T12:00:00Z',
      };
      mockSettlementRepo.create.mockResolvedValue(mockCreated);

      const result = await fullService.recordPayment({
        groupId: 'grp-1',
        fromUserId: 'u-bob',
        toUserId: 'u-alice',
        amount: 15000,
        createdBy: 'u-bob',
      });

      expect(mockSettlementRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          group_id: 'grp-1',
          from_user_id: 'u-bob',
          to_user_id: 'u-alice',
          amount: 15000,
          status: 'paid',
        })
      );
      expect(result.id).toBe('set-100');
    });

    it('records payment in Telegram context and resolves names', async () => {
      vi.mocked(mockBalanceService.getGroupBalanceSummary).mockResolvedValue(mockGroupSummary);
      mockGroupRepo.findByTelegramChatId.mockResolvedValue({ id: 'grp-1', currency: 'INR' });
      mockUserRepo.findByTelegramId.mockResolvedValue({ id: 'u-bob', first_name: 'Bob' });
      mockGroupMemberRepo.findByGroupAndUser
        .mockResolvedValueOnce({ user_id: 'u-bob', is_active: true, display_name: 'Bob' })
        .mockResolvedValueOnce({ user_id: 'u-alice', is_active: true, display_name: 'Alice' });

      mockSettlementRepo.create.mockResolvedValue({
        id: 'set-101',
        group_id: 'grp-1',
        from_user_id: 'u-bob',
        to_user_id: 'u-alice',
        amount: 20000,
        currency: 'INR',
        status: 'paid',
        created_by: 'u-bob',
        settled_at: '2026-09-19T12:00:00Z',
        created_at: '2026-09-19T12:00:00Z',
      });

      const result = await fullService.recordPaymentForTelegram({
        telegramChatId: -1001,
        telegramUserId: 111,
        toUserId: 'u-alice',
        amount: 20000,
      });

      expect(result.fromDisplayName).toBe('Bob');
      expect(result.toDisplayName).toBe('Alice');
      expect(result.settlement.id).toBe('set-101');
    });

    it('rejects self repayment in Telegram context', async () => {
      mockGroupRepo.findByTelegramChatId.mockResolvedValue({ id: 'grp-1' });
      mockUserRepo.findByTelegramId.mockResolvedValue({ id: 'u-bob' });
      mockGroupMemberRepo.findByGroupAndUser.mockResolvedValue({
        user_id: 'u-bob',
        is_active: true,
      });

      await expect(
        fullService.recordPaymentForTelegram({
          telegramChatId: -1001,
          telegramUserId: 111,
          toUserId: 'u-bob', // same user
          amount: 5000,
        })
      ).rejects.toThrow('You cannot make a repayment to yourself.');
    });

    it('retrieves recent payments with resolved display names', async () => {
      mockGroupRepo.findByTelegramChatId.mockResolvedValue({ id: 'grp-1', title: 'Trip' });
      mockUserRepo.findByTelegramId.mockResolvedValue({ id: 'u-bob' });
      mockGroupMemberRepo.findByGroupAndUser
        .mockResolvedValueOnce({ user_id: 'u-bob', is_active: true })
        .mockResolvedValueOnce({ display_name: 'Bob' })
        .mockResolvedValueOnce({ display_name: 'Alice' });

      mockSettlementRepo.findRecentPaidByGroupId.mockResolvedValue([
        {
          id: 'set-1',
          from_user_id: 'u-bob',
          to_user_id: 'u-alice',
          amount: 5000,
          currency: 'INR',
          status: 'paid',
          settled_at: '2026-09-19T12:00:00Z',
          created_at: '2026-09-19T12:00:00Z',
        },
      ]);

      const history = await fullService.getRecentPaymentsForTelegram(-1001, 111, 5);
      expect(history.groupTitle).toBe('Trip');
      expect(history.payments).toHaveLength(1);
      expect(history.payments[0].fromDisplayName).toBe('Bob');
      expect(history.payments[0].toDisplayName).toBe('Alice');
      expect(history.payments[0].amount).toBe(5000);
    });
  });
});
