import { ExpenseRepository, ExpenseWithSplits } from '../../db/repositories/expenses.repository';
import { GroupMemberRepository } from '../../db/repositories/group-members.repository';
import { SettlementRepository } from '../../db/repositories/settlements.repository';
import { UserRepository } from '../../db/repositories/users.repository';
import { GroupRepository } from '../../db/repositories/groups.repository';
import { ExpenseRow } from '../../db/types';
import { ValidationError, NotFoundError } from '../../shared/errors';
import { ExpenseDraft } from './expense-state';
import {
  ExpenseListItem,
  ExpenseHistoryResult,
  ExpenseParticipantDetail,
  ExpenseDetailsResult,
} from './expense.types';

export * from './expense.types';

export class ExpenseService {
  constructor(
    private readonly expenseRepo: ExpenseRepository,
    private readonly groupMemberRepo: GroupMemberRepository,
    private readonly settlementRepo?: SettlementRepository,
    private readonly userRepo?: UserRepository,
    private readonly groupRepo?: GroupRepository
  ) {}

  async createExpenseFromDraft(draft: ExpenseDraft): Promise<ExpenseWithSplits> {
    if (!draft.description || draft.description.trim() === '') {
      throw new ValidationError('Expense description is required');
    }
    if (!draft.totalAmount || draft.totalAmount <= 0) {
      throw new ValidationError('Expense total amount must be positive');
    }
    if (!draft.payerUserId) {
      throw new ValidationError('Payer is required');
    }
    if (!draft.participantUserIds || draft.participantUserIds.length === 0) {
      throw new ValidationError('At least one participant is required');
    }
    if (!draft.splitType) {
      throw new ValidationError('Split type is required');
    }
    if (!draft.splits || draft.splits.length === 0) {
      throw new ValidationError('Expense splits are required');
    }

    const payerMembership = await this.groupMemberRepo.findByGroupAndUser(
      draft.groupId,
      draft.payerUserId
    );
    if (!payerMembership || !payerMembership.is_active) {
      throw new ValidationError('Selected payer is not an active member of this group');
    }

    const activeMembers = await this.groupMemberRepo.findActiveMembersByGroupId(draft.groupId);
    const activeUserIds = new Set(activeMembers.map((m) => m.user_id));
    for (const participantId of draft.participantUserIds) {
      if (!activeUserIds.has(participantId)) {
        throw new ValidationError(`Participant ${participantId} is not an active member of this group`);
      }
    }

    const totalSplitAmount = draft.splits.reduce((sum, s) => sum + s.amount, 0);
    if (totalSplitAmount !== draft.totalAmount) {
      throw new ValidationError(
        `Sum of splits (${totalSplitAmount}) must match total amount (${draft.totalAmount})`
      );
    }

    return this.expenseRepo.createExpenseWithSplits(
      {
        group_id: draft.groupId,
        description: draft.description.trim(),
        total_amount: draft.totalAmount,
        currency: 'INR',
        paid_by: draft.payerUserId,
        created_by: draft.creatorUserId,
        split_type: draft.splitType,
        expense_date: new Date().toISOString(),
      },
      draft.splits.map((s) => ({
        user_id: s.userId,
        amount: s.amount,
        percentage: s.percentage ?? null,
        shares: s.shares ?? null,
      }))
    );
  }

  async getExpenseById(id: string): Promise<ExpenseWithSplits | null> {
    return this.expenseRepo.findById(id);
  }

  async getExpensesByGroupId(
    groupId: string,
    options?: { limit?: number; offset?: number; includeDeleted?: boolean }
  ) {
    return this.expenseRepo.findByGroupId(groupId, options);
  }

  async resolveMemberDisplayName(groupId: string, userId: string): Promise<string> {
    const membership = await this.groupMemberRepo.findByGroupAndUser(groupId, userId);
    if (membership?.display_name && membership.display_name.trim() !== '') {
      return membership.display_name;
    }
    if (this.userRepo) {
      const user = await this.userRepo.findById(userId);
      if (user) {
        const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
        if (name) return name;
      }
    }
    return 'Member';
  }

  authorizeExpenseManagement(expense: ExpenseRow, requestingUserId: string): void {
    if (expense.created_by !== requestingUserId && expense.paid_by !== requestingUserId) {
      throw new ValidationError(
        'You are not authorized to manage this expense. Only the creator or payer can edit or delete it.'
      );
    }
  }

  async hasRepaymentActivity(groupId: string, expense: ExpenseWithSplits): Promise<boolean> {
    if (!this.settlementRepo) return false;
    const paidSettlements = await this.settlementRepo.findPaidByGroupId(groupId);
    if (paidSettlements.length === 0) return false;

    const involvedUserIds = new Set<string>();
    involvedUserIds.add(expense.paid_by);
    for (const split of expense.splits) {
      involvedUserIds.add(split.user_id);
    }

    return paidSettlements.some(
      (s) => involvedUserIds.has(s.from_user_id) || involvedUserIds.has(s.to_user_id)
    );
  }

  async getExpenseHistory(
    groupId: string,
    requestingUserId: string,
    page = 1,
    pageSize = 5
  ): Promise<ExpenseHistoryResult> {
    const membership = await this.groupMemberRepo.findByGroupAndUser(groupId, requestingUserId);
    if (!membership || !membership.is_active) {
      throw new ValidationError('You must be an active member of this group to view expenses.');
    }

    const totalCount = await this.expenseRepo.countActiveByGroupId(groupId);
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const offset = (safePage - 1) * pageSize;

    const expenses = await this.expenseRepo.findByGroupId(groupId, {
      limit: pageSize,
      offset,
      includeDeleted: false,
    });

    const items: ExpenseListItem[] = await Promise.all(
      expenses.map(async (e) => {
        const payerName = await this.resolveMemberDisplayName(groupId, e.paid_by);
        return {
          id: e.id,
          description: e.description,
          totalAmount: e.total_amount,
          currency: e.currency,
          paidByUserId: e.paid_by,
          payerName,
          expenseDate: e.expense_date,
          createdAt: e.created_at,
        };
      })
    );

    return { expenses: items, totalCount, page: safePage, totalPages, pageSize };
  }

  async getExpenseDetails(
    groupId: string,
    expenseId: string,
    requestingUserId: string
  ): Promise<ExpenseDetailsResult> {
    const membership = await this.groupMemberRepo.findByGroupAndUser(groupId, requestingUserId);
    if (!membership || !membership.is_active) {
      throw new ValidationError('You must be an active member of this group to view expense details.');
    }

    const expense = await this.expenseRepo.findById(expenseId);
    if (!expense || expense.deleted_at !== null || expense.group_id !== groupId) {
      throw new NotFoundError('Expense not found or has been deleted.');
    }

    const canManage = expense.created_by === requestingUserId || expense.paid_by === requestingUserId;
    const hasRepayments = await this.hasRepaymentActivity(groupId, expense);
    const payerName = await this.resolveMemberDisplayName(groupId, expense.paid_by);
    const creatorName = await this.resolveMemberDisplayName(groupId, expense.created_by);

    const splits: ExpenseParticipantDetail[] = await Promise.all(
      expense.splits.map(async (s) => {
        const displayName = await this.resolveMemberDisplayName(groupId, s.user_id);
        return {
          userId: s.user_id,
          displayName,
          amount: s.amount,
          percentage: s.percentage,
          shares: s.shares,
        };
      })
    );

    return {
      id: expense.id,
      groupId: expense.group_id,
      description: expense.description,
      totalAmount: expense.total_amount,
      currency: expense.currency,
      paidByUserId: expense.paid_by,
      payerName,
      createdByUserId: expense.created_by,
      creatorName,
      splitType: expense.split_type,
      expenseDate: expense.expense_date,
      createdAt: expense.created_at,
      splits,
      canManage,
      hasRepayments,
    };
  }

  async softDeleteExpense(
    groupId: string,
    expenseId: string,
    requestingUserId: string
  ): Promise<{ alreadyDeleted: boolean; expense: ExpenseRow }> {
    const expense = await this.expenseRepo.findById(expenseId);
    if (!expense) {
      throw new NotFoundError('Expense not found.');
    }
    if (expense.group_id !== groupId) {
      throw new NotFoundError('Expense not found in this group.');
    }
    if (expense.deleted_at !== null) {
      return { alreadyDeleted: true, expense };
    }

    this.authorizeExpenseManagement(expense, requestingUserId);

    const hasRepayments = await this.hasRepaymentActivity(groupId, expense);
    if (hasRepayments) {
      throw new ValidationError(
        '⚠️ This expense has repayment activity. It cannot be deleted because doing so would invalidate financial history.'
      );
    }

    const deleted = await this.expenseRepo.softDelete(expenseId);
    return { alreadyDeleted: false, expense: deleted };
  }

  async updateExpenseDescription(
    groupId: string,
    expenseId: string,
    requestingUserId: string,
    newDescription: string
  ): Promise<ExpenseRow> {
    const expense = await this.expenseRepo.findById(expenseId);
    if (!expense || expense.deleted_at !== null) {
      throw new NotFoundError('Expense not found or has been deleted.');
    }
    if (expense.group_id !== groupId) {
      throw new NotFoundError('Expense not found in this group.');
    }

    this.authorizeExpenseManagement(expense, requestingUserId);

    const trimmed = newDescription.trim();
    if (!trimmed) {
      throw new ValidationError('Expense description cannot be empty.');
    }

    return this.expenseRepo.updateExpenseDescription(expenseId, trimmed);
  }

  async updateExpenseFromDraft(draft: ExpenseDraft): Promise<ExpenseWithSplits> {
    if (!draft.editingExpenseId) {
      throw new ValidationError('Expense draft is not in editing mode.');
    }

    const existing = await this.expenseRepo.findById(draft.editingExpenseId);
    if (!existing || existing.deleted_at !== null || existing.group_id !== draft.groupId) {
      throw new NotFoundError('Expense not found or has been deleted.');
    }

    this.authorizeExpenseManagement(existing, draft.creatorUserId);

    const hasRepayments = await this.hasRepaymentActivity(draft.groupId, existing);
    if (hasRepayments) {
      throw new ValidationError(
        '⚠️ This expense has related repayments. For financial safety, amount/payer/participants cannot be changed after repayment activity.'
      );
    }

    if (!draft.description || draft.description.trim() === '') {
      throw new ValidationError('Expense description is required');
    }
    if (!draft.totalAmount || draft.totalAmount <= 0) {
      throw new ValidationError('Expense total amount must be positive');
    }
    if (!draft.payerUserId) {
      throw new ValidationError('Payer is required');
    }
    if (!draft.participantUserIds || draft.participantUserIds.length === 0) {
      throw new ValidationError('At least one participant is required');
    }
    if (!draft.splitType) {
      throw new ValidationError('Split type is required');
    }
    if (!draft.splits || draft.splits.length === 0) {
      throw new ValidationError('Expense splits are required');
    }

    const payerMembership = await this.groupMemberRepo.findByGroupAndUser(
      draft.groupId,
      draft.payerUserId
    );
    if (!payerMembership || !payerMembership.is_active) {
      throw new ValidationError('Selected payer is not an active member of this group');
    }

    const activeMembers = await this.groupMemberRepo.findActiveMembersByGroupId(draft.groupId);
    const activeUserIds = new Set(activeMembers.map((m) => m.user_id));
    for (const participantId of draft.participantUserIds) {
      if (!activeUserIds.has(participantId)) {
        throw new ValidationError(`Participant ${participantId} is not an active member of this group`);
      }
    }

    const totalSplitAmount = draft.splits.reduce((sum, s) => sum + s.amount, 0);
    if (totalSplitAmount !== draft.totalAmount) {
      throw new ValidationError(
        `Sum of splits (${totalSplitAmount}) must match total amount (${draft.totalAmount})`
      );
    }

    return this.expenseRepo.updateExpenseWithSplits(
      draft.editingExpenseId,
      {
        description: draft.description.trim(),
        total_amount: draft.totalAmount,
        paid_by: draft.payerUserId,
        split_type: draft.splitType,
      },
      draft.splits.map((s) => ({
        user_id: s.userId,
        amount: s.amount,
        percentage: s.percentage ?? null,
        shares: s.shares ?? null,
      }))
    );
  }

  private async resolveTelegramContext(telegramChatId: number, telegramUserId: number) {
    if (!this.groupRepo || !this.userRepo) {
      throw new ValidationError('Group or User repository not configured.');
    }
    const group = await this.groupRepo.findByTelegramChatId(telegramChatId);
    if (!group) {
      throw new NotFoundError('Group is not registered. Please run /start inside the group.');
    }
    const user = await this.userRepo.findByTelegramId(telegramUserId);
    if (!user) {
      throw new NotFoundError('User profile not found. Please interact with the bot first.');
    }
    const membership = await this.groupMemberRepo.findByGroupAndUser(group.id, user.id);
    if (!membership || !membership.is_active) {
      throw new ValidationError('You must be an active member of this group.');
    }
    return { group, user };
  }

  async getExpenseHistoryForTelegram(
    telegramChatId: number,
    telegramUserId: number,
    page = 1
  ): Promise<ExpenseHistoryResult> {
    const { group, user } = await this.resolveTelegramContext(telegramChatId, telegramUserId);
    return this.getExpenseHistory(group.id, user.id, page);
  }

  async getExpenseDetailsForTelegram(
    telegramChatId: number,
    telegramUserId: number,
    expenseId: string
  ): Promise<ExpenseDetailsResult> {
    const { group, user } = await this.resolveTelegramContext(telegramChatId, telegramUserId);
    return this.getExpenseDetails(group.id, expenseId, user.id);
  }

  async softDeleteExpenseForTelegram(
    telegramChatId: number,
    telegramUserId: number,
    expenseId: string
  ): Promise<{ alreadyDeleted: boolean; expense: ExpenseRow }> {
    const { group, user } = await this.resolveTelegramContext(telegramChatId, telegramUserId);
    return this.softDeleteExpense(group.id, expenseId, user.id);
  }

  async updateExpenseDescriptionForTelegram(
    telegramChatId: number,
    telegramUserId: number,
    expenseId: string,
    newDescription: string
  ): Promise<ExpenseRow> {
    const { group, user } = await this.resolveTelegramContext(telegramChatId, telegramUserId);
    return this.updateExpenseDescription(group.id, expenseId, user.id, newDescription);
  }
}
