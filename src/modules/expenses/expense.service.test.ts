import { describe, it, expect, vi } from 'vitest';
import { ExpenseService } from './expense.service';
import { ExpenseRepository } from '../../db/repositories/expenses.repository';
import { GroupMemberRepository } from '../../db/repositories/group-members.repository';
import { ExpenseDraft } from './expense-state';

function createMocks() {
  const expenseRepo = {
    createExpenseWithSplits: vi.fn(),
    findById: vi.fn(),
    findByGroupId: vi.fn(),
  } as unknown as ExpenseRepository;

  const groupMemberRepo = {
    findByGroupAndUser: vi.fn(),
    findActiveMembersByGroupId: vi.fn(),
  } as unknown as GroupMemberRepository;

  return { expenseRepo, groupMemberRepo };
}

describe('ExpenseService', () => {
  const validDraft: ExpenseDraft = {
    chatId: -100123,
    userId: 111,
    groupId: 'grp-1',
    creatorUserId: 'usr-creator',
    step: 'AWAITING_CONFIRMATION',
    description: 'Dinner',
    totalAmount: 240000, // 240000 paise = ₹2400.00
    payerUserId: 'usr-payer',
    payerName: 'Dev',
    participantUserIds: ['usr-1', 'usr-2'],
    splitType: 'equal',
    splits: [
      { userId: 'usr-1', name: 'Dev', amount: 120000 },
      { userId: 'usr-2', name: 'Rahul', amount: 120000 },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it('saves expense successfully when valid', async () => {
    const { expenseRepo, groupMemberRepo } = createMocks();
    (groupMemberRepo.findByGroupAndUser as any).mockResolvedValue({
      id: 'gm-payer',
      group_id: 'grp-1',
      user_id: 'usr-payer',
      is_active: true,
    });

    (groupMemberRepo.findActiveMembersByGroupId as any).mockResolvedValue([
      { user_id: 'usr-1', is_active: true },
      { user_id: 'usr-2', is_active: true },
      { user_id: 'usr-payer', is_active: true },
      { user_id: 'usr-creator', is_active: true },
    ]);

    const mockCreated = {
      id: 'exp-123',
      group_id: 'grp-1',
      description: 'Dinner',
      total_amount: 240000,
      splits: [],
    };
    (expenseRepo.createExpenseWithSplits as any).mockResolvedValue(mockCreated);

    const service = new ExpenseService(expenseRepo, groupMemberRepo);
    const result = await service.createExpenseFromDraft(validDraft);

    expect(result).toEqual(mockCreated);
    expect(expenseRepo.createExpenseWithSplits).toHaveBeenCalledWith(
      expect.objectContaining({
        group_id: 'grp-1',
        description: 'Dinner',
        total_amount: 240000,
        paid_by: 'usr-payer',
        created_by: 'usr-creator',
        split_type: 'equal',
      }),
      expect.arrayContaining([
        { user_id: 'usr-1', amount: 120000, percentage: null, shares: null },
        { user_id: 'usr-2', amount: 120000, percentage: null, shares: null },
      ])
    );
  });

  it('saves shares split expense successfully with participant shares stored', async () => {
    const { expenseRepo, groupMemberRepo } = createMocks();
    (groupMemberRepo.findByGroupAndUser as any).mockResolvedValue({
      user_id: 'usr-payer',
      is_active: true,
    });
    (groupMemberRepo.findActiveMembersByGroupId as any).mockResolvedValue([
      { user_id: 'usr-1', is_active: true },
      { user_id: 'usr-2', is_active: true },
      { user_id: 'usr-payer', is_active: true },
    ]);

    const sharesDraft: ExpenseDraft = {
      chatId: -1001234567,
      userId: 12345,
      groupId: 'grp-1',
      creatorUserId: 'usr-creator',
      step: 'SAVING',
      description: 'Dinner Party',
      totalAmount: 300000,
      payerUserId: 'usr-payer',
      payerName: 'Dev',
      participantUserIds: ['usr-1', 'usr-2'],
      splitType: 'shares',
      splits: [
        { userId: 'usr-1', name: 'Alice', amount: 200000, shares: 2 },
        { userId: 'usr-2', name: 'Bob', amount: 100000, shares: 1 },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    (expenseRepo.createExpenseWithSplits as any).mockResolvedValue({ id: 'exp-shares-123' });

    const service = new ExpenseService(expenseRepo, groupMemberRepo);
    const result = await service.createExpenseFromDraft(sharesDraft);

    expect(result).toEqual({ id: 'exp-shares-123' });
    expect(expenseRepo.createExpenseWithSplits).toHaveBeenCalledWith(
      expect.objectContaining({
        split_type: 'shares',
        total_amount: 300000,
      }),
      expect.arrayContaining([
        { user_id: 'usr-1', amount: 200000, percentage: null, shares: 2 },
        { user_id: 'usr-2', amount: 100000, percentage: null, shares: 1 },
      ])
    );
  });

  it('rejects saving if payer is not an active group member', async () => {
    const { expenseRepo, groupMemberRepo } = createMocks();
    // Payer not found in group
    (groupMemberRepo.findByGroupAndUser as any).mockResolvedValue(null);

    const service = new ExpenseService(expenseRepo, groupMemberRepo);

    await expect(service.createExpenseFromDraft(validDraft)).rejects.toThrow(
      /Selected payer is not an active member/
    );
    expect(expenseRepo.createExpenseWithSplits).not.toHaveBeenCalled();
  });

  it('rejects saving if any participant is not an active member of the group', async () => {
    const { expenseRepo, groupMemberRepo } = createMocks();
    (groupMemberRepo.findByGroupAndUser as any).mockResolvedValue({
      user_id: 'usr-payer',
      is_active: true,
    });

    // Only usr-1 is active in group, usr-2 is missing!
    (groupMemberRepo.findActiveMembersByGroupId as any).mockResolvedValue([
      { user_id: 'usr-1', is_active: true },
    ]);

    const service = new ExpenseService(expenseRepo, groupMemberRepo);

    await expect(service.createExpenseFromDraft(validDraft)).rejects.toThrow(
      /Participant usr-2 is not an active member/
    );
    expect(expenseRepo.createExpenseWithSplits).not.toHaveBeenCalled();
  });

  it('allows creator to not be a participant (separate concepts)', async () => {
    const { expenseRepo, groupMemberRepo } = createMocks();
    (groupMemberRepo.findByGroupAndUser as any).mockResolvedValue({
      user_id: 'usr-payer',
      is_active: true,
    });

    (groupMemberRepo.findActiveMembersByGroupId as any).mockResolvedValue([
      { user_id: 'usr-1', is_active: true },
      { user_id: 'usr-2', is_active: true },
      { user_id: 'usr-creator', is_active: true },
      { user_id: 'usr-payer', is_active: true },
    ]);

    (expenseRepo.createExpenseWithSplits as any).mockResolvedValue({ id: 'exp-ok' });

    // Draft where creator ('usr-creator') is not in participantUserIds
    const service = new ExpenseService(expenseRepo, groupMemberRepo);
    await service.createExpenseFromDraft(validDraft);

    expect(expenseRepo.createExpenseWithSplits).toHaveBeenCalled();
  });

  it('rejects saving if sum of splits does not match total amount', async () => {
    const { expenseRepo, groupMemberRepo } = createMocks();
    (groupMemberRepo.findByGroupAndUser as any).mockResolvedValue({
      user_id: 'usr-payer',
      is_active: true,
    });

    (groupMemberRepo.findActiveMembersByGroupId as any).mockResolvedValue([
      { user_id: 'usr-1', is_active: true },
      { user_id: 'usr-2', is_active: true },
    ]);

    const mismatchDraft: ExpenseDraft = {
      ...validDraft,
      splits: [
        { userId: 'usr-1', name: 'Dev', amount: 100000 },
        { userId: 'usr-2', name: 'Rahul', amount: 100000 }, // sum 200000 != 240000
      ],
    };

    const service = new ExpenseService(expenseRepo, groupMemberRepo);

    await expect(service.createExpenseFromDraft(mismatchDraft)).rejects.toThrow(
      /Sum of splits .* must match total amount/
    );
    expect(expenseRepo.createExpenseWithSplits).not.toHaveBeenCalled();
  });
});
