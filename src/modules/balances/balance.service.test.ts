import { describe, it, expect, vi } from 'vitest';
import { BalanceService } from './balance.service';
import { ExpenseRepository } from '../../db/repositories/expenses.repository';
import { GroupRepository } from '../../db/repositories/groups.repository';
import { GroupMemberRepository } from '../../db/repositories/group-members.repository';
import { UserRepository } from '../../db/repositories/users.repository';
import { NotFoundError, ValidationError } from '../../shared/errors';

describe('BalanceService', () => {
  const mockExpenseRepo = {
    findActiveExpensesWithSplitsByGroupId: vi.fn(),
  } as unknown as ExpenseRepository;

  const mockGroupRepo = {
    findById: vi.fn(),
    findByTelegramChatId: vi.fn(),
  } as unknown as GroupRepository;

  const mockGroupMemberRepo = {
    findActiveMembersByGroupId: vi.fn(),
    findByGroupAndUser: vi.fn(),
  } as unknown as GroupMemberRepository;

  const mockUserRepo = {
    findById: vi.fn(),
    findByTelegramId: vi.fn(),
  } as unknown as UserRepository;

  const service = new BalanceService(
    mockExpenseRepo,
    mockGroupRepo,
    mockGroupMemberRepo,
    mockUserRepo
  );

  it('throws NotFoundError when group is not found by ID', async () => {
    vi.mocked(mockGroupRepo.findById).mockResolvedValue(null);

    await expect(service.getGroupBalanceSummary('non-existent')).rejects.toThrow(NotFoundError);
  });

  it('calculates group balance summary using active members and batch expenses', async () => {
    vi.mocked(mockGroupRepo.findById).mockResolvedValue({
      id: 'grp-1',
      telegram_chat_id: -1001,
      title: 'Trip',
      created_at: '',
      updated_at: '',
    });

    vi.mocked(mockGroupMemberRepo.findActiveMembersByGroupId).mockResolvedValue([
      {
        id: 'gm-1',
        group_id: 'grp-1',
        user_id: 'usr-1',
        display_name: 'Alice',
        is_active: true,
        joined_at: '',
      },
      {
        id: 'gm-2',
        group_id: 'grp-1',
        user_id: 'usr-2',
        display_name: null, // Fall back to user repo
        is_active: true,
        joined_at: '',
      },
    ]);

    vi.mocked(mockUserRepo.findById).mockResolvedValue({
      id: 'usr-2',
      telegram_user_id: 222,
      first_name: 'Bob',
      last_name: 'Smith',
      username: 'bobsmith',
      created_at: '',
      updated_at: '',
    });

    vi.mocked(mockExpenseRepo.findActiveExpensesWithSplitsByGroupId).mockResolvedValue([
      {
        id: 'exp-1',
        group_id: 'grp-1',
        paid_by: 'usr-1',
        created_by: 'usr-1',
        description: 'Snacks',
        category: 'food',
        currency: 'INR',
        expense_date: '2026-09-19',
        split_type: 'equal',
        total_amount: 10000,
        deleted_at: null,
        created_at: '',
        updated_at: '',
        splits: [
          { id: 's-1', expense_id: 'exp-1', user_id: 'usr-1', amount: 5000, percentage: null, shares: null, created_at: '' },
          { id: 's-2', expense_id: 'exp-1', user_id: 'usr-2', amount: 5000, percentage: null, shares: null, created_at: '' },
        ],
      },
    ]);

    const summary = await service.getGroupBalanceSummary('grp-1');

    expect(summary.totalExpensesCount).toBe(1);
    expect(summary.totalExpensesAmount).toBe(10000);
    expect(summary.creditors[0].displayName).toBe('Alice');
    expect(summary.creditors[0].netBalance).toBe(5000);
    expect(summary.debtors[0].displayName).toBe('Bob Smith');
    expect(summary.debtors[0].netBalance).toBe(-5000);
  });

  it('calculates personal user balance within a group', async () => {
    vi.mocked(mockGroupRepo.findById).mockResolvedValue({
      id: 'grp-1',
      telegram_chat_id: -1001,
      title: 'Trip',
      created_at: '',
      updated_at: '',
    });

    vi.mocked(mockGroupMemberRepo.findActiveMembersByGroupId).mockResolvedValue([
      {
        id: 'gm-1',
        group_id: 'grp-1',
        user_id: 'usr-1',
        display_name: 'Alice',
        is_active: true,
        joined_at: '',
      },
    ]);

    vi.mocked(mockExpenseRepo.findActiveExpensesWithSplitsByGroupId).mockResolvedValue([]);

    const personal = await service.getUserBalanceInGroup('grp-1', 'usr-1');

    expect(personal.userId).toBe('usr-1');
    expect(personal.displayName).toBe('Alice');
    expect(personal.netBalance).toBe(0);
    expect(personal.category).toBe('settled');
  });

  describe('Telegram Context Validations', () => {
    it('throws NotFoundError if group not registered for Telegram chat', async () => {
      vi.mocked(mockGroupRepo.findByTelegramChatId).mockResolvedValue(null);

      await expect(service.getGroupSummaryForTelegram(-999, 123)).rejects.toThrow(
        /Group is not registered/
      );
    });

    it('throws NotFoundError if user not registered in DB', async () => {
      vi.mocked(mockGroupRepo.findByTelegramChatId).mockResolvedValue({
        id: 'grp-1',
        telegram_chat_id: -1001,
        title: 'Trip',
        created_at: '',
        updated_at: '',
      });
      vi.mocked(mockUserRepo.findByTelegramId).mockResolvedValue(null);

      await expect(service.getGroupSummaryForTelegram(-1001, 999)).rejects.toThrow(
        /User profile not found/
      );
    });

    it('throws ValidationError if user is not an active member', async () => {
      vi.mocked(mockGroupRepo.findByTelegramChatId).mockResolvedValue({
        id: 'grp-1',
        telegram_chat_id: -1001,
        title: 'Trip',
        created_at: '',
        updated_at: '',
      });
      vi.mocked(mockUserRepo.findByTelegramId).mockResolvedValue({
        id: 'usr-1',
        telegram_user_id: 111,
        first_name: 'Alice',
        last_name: null,
        username: 'alice',
        created_at: '',
        updated_at: '',
      });
      vi.mocked(mockGroupMemberRepo.findByGroupAndUser).mockResolvedValue(null);

      await expect(service.getGroupSummaryForTelegram(-1001, 111)).rejects.toThrow(
        ValidationError
      );
    });

    it('successfully retrieves personal balance for verified Telegram user', async () => {
      vi.mocked(mockGroupRepo.findByTelegramChatId).mockResolvedValue({
        id: 'grp-1',
        telegram_chat_id: -1001,
        title: 'Trip',
        created_at: '',
        updated_at: '',
      });
      vi.mocked(mockUserRepo.findByTelegramId).mockResolvedValue({
        id: 'usr-1',
        telegram_user_id: 111,
        first_name: 'Alice',
        last_name: null,
        username: 'alice',
        created_at: '',
        updated_at: '',
      });
      vi.mocked(mockGroupMemberRepo.findByGroupAndUser).mockResolvedValue({
        id: 'gm-1',
        group_id: 'grp-1',
        user_id: 'usr-1',
        display_name: 'Alice',
        is_active: true,
        joined_at: '',
      });
      vi.mocked(mockGroupRepo.findById).mockResolvedValue({
        id: 'grp-1',
        telegram_chat_id: -1001,
        title: 'Trip',
        created_at: '',
        updated_at: '',
      });
      vi.mocked(mockGroupMemberRepo.findActiveMembersByGroupId).mockResolvedValue([
        {
          id: 'gm-1',
          group_id: 'grp-1',
          user_id: 'usr-1',
          display_name: 'Alice',
          is_active: true,
          joined_at: '',
        },
      ]);
      vi.mocked(mockExpenseRepo.findActiveExpensesWithSplitsByGroupId).mockResolvedValue([]);

      const balance = await service.getUserBalanceForTelegram(-1001, 111);
      expect(balance.userId).toBe('usr-1');
      expect(balance.netBalance).toBe(0);
      expect(balance.category).toBe('settled');
    });
  });

  describe('Reconciled Balances', () => {
    it('returns reconciled balance summary accounting for paid settlements', async () => {
      const mockSettlementRepo = {
        findPaidByGroupId: vi.fn().mockResolvedValue([
          {
            id: 'set-1',
            group_id: 'grp-1',
            from_user_id: 'usr-2',
            to_user_id: 'usr-1',
            amount: 5000,
            status: 'paid',
          },
        ]),
      };

      const reconciledService = new BalanceService(
        mockExpenseRepo,
        mockGroupRepo,
        mockGroupMemberRepo,
        mockUserRepo,
        mockSettlementRepo as any
      );

      vi.mocked(mockGroupRepo.findById).mockResolvedValue({
        id: 'grp-1',
        telegram_chat_id: -1001,
        title: 'Trip',
        created_at: '',
        updated_at: '',
      });
      vi.mocked(mockGroupMemberRepo.findActiveMembersByGroupId).mockResolvedValue([
        {
          id: 'gm-1',
          group_id: 'grp-1',
          user_id: 'usr-1',
          display_name: 'Alice',
          is_active: true,
          joined_at: '',
        },
        {
          id: 'gm-2',
          group_id: 'grp-1',
          user_id: 'usr-2',
          display_name: 'Bob',
          is_active: true,
          joined_at: '',
        },
      ]);
      vi.mocked(mockExpenseRepo.findActiveExpensesWithSplitsByGroupId).mockResolvedValue([
        {
          id: 'exp-1',
          group_id: 'grp-1',
          description: 'Lunch',
          category: 'general',
          total_amount: 10000,
          paid_by: 'usr-1',
          created_by: 'usr-1',
          split_type: 'equal',
          currency: 'INR',
          expense_date: '',
          created_at: '',
          updated_at: '',
          deleted_at: null,
          splits: [
            { id: 's1', expense_id: 'exp-1', user_id: 'usr-1', amount: 5000, percentage: null, shares: null, created_at: '' },
            { id: 's2', expense_id: 'exp-1', user_id: 'usr-2', amount: 5000, percentage: null, shares: null, created_at: '' },
          ],
        },
      ]);

      const summary = await reconciledService.getReconciledGroupBalanceSummary('grp-1');
      expect(summary.totalPaymentsCount).toBe(1);
      expect(summary.totalPaymentsAmount).toBe(5000);

      const bob = summary.allBalances.find((m) => m.userId === 'usr-2')!;
      expect(bob.outstandingNet).toBe(0);
      expect(bob.category).toBe('settled');

      const userBalance = await reconciledService.getReconciledUserBalanceInGroup('grp-1', 'usr-2');
      expect(userBalance.rawBalance).toBe(-5000);
      expect(userBalance.paymentsMade).toBe(5000);
      expect(userBalance.outstandingNet).toBe(0);
      expect(userBalance.category).toBe('settled');
    });
  });
});
