import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExpenseService } from './expense.service';
import { ExpenseRepository, ExpenseWithSplits } from '../../db/repositories/expenses.repository';
import { GroupMemberRepository } from '../../db/repositories/group-members.repository';
import { SettlementRepository } from '../../db/repositories/settlements.repository';
import { UserRepository } from '../../db/repositories/users.repository';
import { GroupRepository } from '../../db/repositories/groups.repository';
import { ValidationError, NotFoundError } from '../../shared/errors';
import { ExpenseDraft } from './expense-state';

describe('ExpenseService - Management & History', () => {
  let expenseRepo: ExpenseRepository;
  let groupMemberRepo: GroupMemberRepository;
  let settlementRepo: SettlementRepository;
  let userRepo: UserRepository;
  let groupRepo: GroupRepository;
  let service: ExpenseService;

  const mockExpense: ExpenseWithSplits = {
    id: 'exp-1',
    group_id: 'grp-1',
    description: 'Team Lunch',
    category: 'food',
    total_amount: 3000,
    currency: 'INR',
    paid_by: 'usr-alice',
    created_by: 'usr-bob',
    split_type: 'equal',
    expense_date: '2026-09-19T12:00:00Z',
    created_at: '2026-09-19T12:00:00Z',
    updated_at: '2026-09-19T12:00:00Z',
    deleted_at: null,
    splits: [
      { id: 's-1', expense_id: 'exp-1', user_id: 'usr-alice', amount: 1500, percentage: 50, shares: null, created_at: '2026-09-19T12:00:00Z' },
      { id: 's-2', expense_id: 'exp-1', user_id: 'usr-bob', amount: 1500, percentage: 50, shares: null, created_at: '2026-09-19T12:00:00Z' },
    ],
  };

  beforeEach(() => {
    expenseRepo = {
      findById: vi.fn(),
      findByGroupId: vi.fn(),
      findActiveExpensesWithSplitsByGroupId: vi.fn(),
      countActiveByGroupId: vi.fn(),
      createExpenseWithSplits: vi.fn(),
      updateExpenseDescription: vi.fn(),
      updateExpenseWithSplits: vi.fn(),
      softDelete: vi.fn(),
    } as unknown as ExpenseRepository;

    groupMemberRepo = {
      findByGroupAndUser: vi.fn(),
      findActiveMembersByGroupId: vi.fn(),
    } as unknown as GroupMemberRepository;

    settlementRepo = {
      findPaidByGroupId: vi.fn().mockResolvedValue([]),
    } as unknown as SettlementRepository;

    userRepo = {
      findById: vi.fn(),
      findByTelegramId: vi.fn(),
    } as unknown as UserRepository;

    groupRepo = {
      findById: vi.fn(),
      findByTelegramChatId: vi.fn(),
    } as unknown as GroupRepository;

    service = new ExpenseService(
      expenseRepo,
      groupMemberRepo,
      settlementRepo,
      userRepo,
      groupRepo
    );
  });

  describe('getExpenseHistory', () => {
    it('returns paginated expenses with resolved payer names', async () => {
      vi.mocked(groupMemberRepo.findByGroupAndUser).mockResolvedValue({
        id: 'gm-1',
        group_id: 'grp-1',
        user_id: 'usr-alice',
        display_name: 'Alice',
        joined_at: '2026-09-01T00:00:00Z',
        is_active: true,
      });

      vi.mocked(expenseRepo.countActiveByGroupId).mockResolvedValue(1);
      vi.mocked(expenseRepo.findByGroupId).mockResolvedValue([mockExpense]);

      const result = await service.getExpenseHistory('grp-1', 'usr-alice', 1, 5);

      expect(result.totalCount).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.expenses).toHaveLength(1);
      expect(result.expenses[0].payerName).toBe('Alice');
      expect(result.expenses[0].description).toBe('Team Lunch');
      expect(result.expenses[0].totalAmount).toBe(3000);
    });

    it('rejects history retrieval if requesting user is not active member', async () => {
      vi.mocked(groupMemberRepo.findByGroupAndUser).mockResolvedValue(null);

      await expect(service.getExpenseHistory('grp-1', 'usr-unknown', 1, 5))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('getExpenseDetails & Authorization', () => {
    beforeEach(() => {
      vi.mocked(groupMemberRepo.findByGroupAndUser).mockImplementation(async (_g, u) => ({
        id: `gm-${u}`,
        group_id: 'grp-1',
        user_id: u,
        display_name: u === 'usr-alice' ? 'Alice' : u === 'usr-bob' ? 'Bob' : 'Charlie',
        joined_at: '2026-09-01T00:00:00Z',
        is_active: true,
      }));
      vi.mocked(expenseRepo.findById).mockResolvedValue(mockExpense);
    });

    it('allows creator to manage expense (canManage: true)', async () => {
      const details = await service.getExpenseDetails('grp-1', 'exp-1', 'usr-bob');
      expect(details.canManage).toBe(true);
      expect(details.creatorName).toBe('Bob');
      expect(details.payerName).toBe('Alice');
      expect(details.splits).toHaveLength(2);
    });

    it('allows payer to manage expense (canManage: true)', async () => {
      const details = await service.getExpenseDetails('grp-1', 'exp-1', 'usr-alice');
      expect(details.canManage).toBe(true);
    });

    it('restricts unrelated group member from managing expense (canManage: false)', async () => {
      const details = await service.getExpenseDetails('grp-1', 'exp-1', 'usr-charlie');
      expect(details.canManage).toBe(false);
    });

    it('throws NotFoundError for soft-deleted or non-existent expense', async () => {
      vi.mocked(expenseRepo.findById).mockResolvedValue({
        ...mockExpense,
        deleted_at: '2026-09-19T13:00:00Z',
      });

      await expect(service.getExpenseDetails('grp-1', 'exp-1', 'usr-alice'))
        .rejects.toThrow(NotFoundError);
    });
  });

  describe('Repayment Safety & Soft Deletion', () => {
    beforeEach(() => {
      vi.mocked(expenseRepo.findById).mockResolvedValue(mockExpense);
    });

    it('successfully soft-deletes expense when authorized and no repayments exist', async () => {
      vi.mocked(settlementRepo.findPaidByGroupId).mockResolvedValue([]);
      vi.mocked(expenseRepo.softDelete).mockResolvedValue({
        ...mockExpense,
        deleted_at: '2026-09-19T14:00:00Z',
      });

      const result = await service.softDeleteExpense('grp-1', 'exp-1', 'usr-bob');

      expect(result.alreadyDeleted).toBe(false);
      expect(expenseRepo.softDelete).toHaveBeenCalledWith('exp-1');
    });

    it('is idempotent when expense is already deleted', async () => {
      vi.mocked(expenseRepo.findById).mockResolvedValue({
        ...mockExpense,
        deleted_at: '2026-09-19T13:00:00Z',
      });

      const result = await service.softDeleteExpense('grp-1', 'exp-1', 'usr-bob');

      expect(result.alreadyDeleted).toBe(true);
      expect(expenseRepo.softDelete).not.toHaveBeenCalled();
    });

    it('BLOCKS deletion if repayment activity exists for expense participants', async () => {
      vi.mocked(settlementRepo.findPaidByGroupId).mockResolvedValue([
        {
          id: 'set-1',
          group_id: 'grp-1',
          from_user_id: 'usr-bob',
          to_user_id: 'usr-alice',
          amount: 1500,
          status: 'paid',
          currency: 'INR',
          created_by: 'usr-bob',
          settled_at: '2026-09-19T13:00:00Z',
          created_at: '2026-09-19T12:30:00Z',
        },
      ]);

      await expect(service.softDeleteExpense('grp-1', 'exp-1', 'usr-bob'))
        .rejects.toThrow(
          '⚠️ This expense has repayment activity. It cannot be deleted because doing so would invalidate financial history.'
        );

      expect(expenseRepo.softDelete).not.toHaveBeenCalled();
    });

    it('rejects deletion if unauthorized user attempts it', async () => {
      await expect(service.softDeleteExpense('grp-1', 'exp-1', 'usr-charlie'))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('Expense Updates & Repayment Safety', () => {
    beforeEach(() => {
      vi.mocked(expenseRepo.findById).mockResolvedValue(mockExpense);
    });

    it('allows updating description even if repayments exist', async () => {
      vi.mocked(settlementRepo.findPaidByGroupId).mockResolvedValue([
        {
          id: 'set-1',
          group_id: 'grp-1',
          from_user_id: 'usr-bob',
          to_user_id: 'usr-alice',
          amount: 1500,
          status: 'paid',
          currency: 'INR',
          created_by: 'usr-bob',
          settled_at: '2026-09-19T13:00:00Z',
          created_at: '2026-09-19T12:30:00Z',
        },
      ]);

      vi.mocked(expenseRepo.updateExpenseDescription).mockResolvedValue({
        ...mockExpense,
        description: 'New Description',
      });

      const updated = await service.updateExpenseDescription(
        'grp-1',
        'exp-1',
        'usr-alice',
        'New Description'
      );

      expect(expenseRepo.updateExpenseDescription).toHaveBeenCalledWith('exp-1', 'New Description');
      expect(updated.description).toBe('New Description');
    });

    it('BLOCKS financial edit from draft if repayments exist', async () => {
      vi.mocked(settlementRepo.findPaidByGroupId).mockResolvedValue([
        {
          id: 'set-1',
          group_id: 'grp-1',
          from_user_id: 'usr-bob',
          to_user_id: 'usr-alice',
          amount: 1500,
          status: 'paid',
          currency: 'INR',
          created_by: 'usr-bob',
          settled_at: '2026-09-19T13:00:00Z',
          created_at: '2026-09-19T12:30:00Z',
        },
      ]);

      const draft: ExpenseDraft = {
        chatId: 100,
        userId: 200,
        groupId: 'grp-1',
        creatorUserId: 'usr-bob',
        editingExpenseId: 'exp-1',
        step: 'AWAITING_CONFIRMATION',
        description: 'Updated Dinner',
        totalAmount: 4000,
        payerUserId: 'usr-alice',
        participantUserIds: ['usr-alice', 'usr-bob'],
        splitType: 'equal',
        splits: [
          { userId: 'usr-alice', name: 'Alice', amount: 2000 },
          { userId: 'usr-bob', name: 'Bob', amount: 2000 },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await expect(service.updateExpenseFromDraft(draft))
        .rejects.toThrow(
          '⚠️ This expense has related repayments. For financial safety, amount/payer/participants cannot be changed after repayment activity.'
        );

      expect(expenseRepo.updateExpenseWithSplits).not.toHaveBeenCalled();
    });

    it('allows financial edit from draft if NO repayments exist', async () => {
      vi.mocked(settlementRepo.findPaidByGroupId).mockResolvedValue([]);
      vi.mocked(groupMemberRepo.findByGroupAndUser).mockResolvedValue({
        id: 'gm-1',
        group_id: 'grp-1',
        user_id: 'usr-alice',
        display_name: 'Alice',
        joined_at: '2026-09-01T00:00:00Z',
        is_active: true,
      });
      vi.mocked(groupMemberRepo.findActiveMembersByGroupId).mockResolvedValue([
        { id: 'gm-1', group_id: 'grp-1', user_id: 'usr-alice', display_name: 'Alice', joined_at: '', is_active: true },
        { id: 'gm-2', group_id: 'grp-1', user_id: 'usr-bob', display_name: 'Bob', joined_at: '', is_active: true },
      ]);

      const draft: ExpenseDraft = {
        chatId: 100,
        userId: 200,
        groupId: 'grp-1',
        creatorUserId: 'usr-bob',
        editingExpenseId: 'exp-1',
        step: 'AWAITING_CONFIRMATION',
        description: 'Updated Dinner',
        totalAmount: 4000,
        payerUserId: 'usr-alice',
        participantUserIds: ['usr-alice', 'usr-bob'],
        splitType: 'equal',
        splits: [
          { userId: 'usr-alice', name: 'Alice', amount: 2000 },
          { userId: 'usr-bob', name: 'Bob', amount: 2000 },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(expenseRepo.updateExpenseWithSplits).mockResolvedValue({
        ...mockExpense,
        description: 'Updated Dinner',
        total_amount: 4000,
      });

      const updated = await service.updateExpenseFromDraft(draft);

      expect(expenseRepo.updateExpenseWithSplits).toHaveBeenCalledWith(
        'exp-1',
        expect.objectContaining({ description: 'Updated Dinner', total_amount: 4000 }),
        expect.any(Array)
      );
      expect(updated.total_amount).toBe(4000);
    });
  });
});
