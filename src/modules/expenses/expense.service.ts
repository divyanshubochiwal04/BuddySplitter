import { ExpenseRepository, ExpenseWithSplits } from '../../db/repositories/expenses.repository';
import { GroupMemberRepository } from '../../db/repositories/group-members.repository';
import { ValidationError } from '../../shared/errors';
import { ExpenseDraft } from './expense-state';

export class ExpenseService {
  constructor(
    private readonly expenseRepo: ExpenseRepository,
    private readonly groupMemberRepo: GroupMemberRepository
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

    // 1. Verify that payer is an active member of the group
    const payerMembership = await this.groupMemberRepo.findByGroupAndUser(
      draft.groupId,
      draft.payerUserId
    );

    if (!payerMembership || !payerMembership.is_active) {
      throw new ValidationError('Selected payer is not an active member of this group');
    }

    // 2. Verify that all participants are active members of the group
    const activeMembers = await this.groupMemberRepo.findActiveMembersByGroupId(draft.groupId);
    const activeUserIds = new Set(activeMembers.map((m) => m.user_id));

    for (const participantId of draft.participantUserIds) {
      if (!activeUserIds.has(participantId)) {
        throw new ValidationError(
          `Participant ${participantId} is not an active member of this group`
        );
      }
    }

    // 3. Verify that the sum of splits exactly equals totalAmount
    const totalSplitAmount = draft.splits.reduce((sum, s) => sum + s.amount, 0);
    if (totalSplitAmount !== draft.totalAmount) {
      throw new ValidationError(
        `Sum of splits (${totalSplitAmount}) must match total amount (${draft.totalAmount})`
      );
    }

    // 4. Save expense and splits via repository
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
      }))
    );
  }

  async getExpenseById(id: string): Promise<ExpenseWithSplits | null> {
    return this.expenseRepo.findById(id);
  }

  async getExpensesByGroupId(
    groupId: string,
    options?: { limit?: number; offset?: number }
  ) {
    return this.expenseRepo.findByGroupId(groupId, options);
  }
}
