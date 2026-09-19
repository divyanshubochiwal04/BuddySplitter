import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Context } from 'grammy';
import {
  handleExpenseManagementCallback,
  handleExpenseEditTextInput,
} from './expense-management-callbacks';
import { BotServices } from '../../modules/services';
import { expenseEditStateManager } from '../../modules/expenses/expense-edit-state';
import { expenseStateManager } from '../../modules/expenses/expense-state';

function createMockContext(overrides?: Partial<Context>): Context {
  const ctx = {
    chat: { id: 1001, type: 'group', title: 'Trip Group' },
    from: { id: 2001, first_name: 'Alice' },
    callbackQuery: { data: '' },
    answerCallbackQuery: vi.fn(),
    reply: vi.fn(),
    editMessageText: vi.fn(),
    ...overrides,
  } as unknown as Context;
  return ctx;
}

describe('Expense Management Callbacks', () => {
  let services: BotServices;

  const mockHistoryResult = {
    expenses: [
      {
        id: 'exp-1',
        description: 'Dinner',
        totalAmount: 2000,
        currency: 'INR',
        paidByUserId: 'u-1',
        payerName: 'Alice',
        expenseDate: '2026-09-19T12:00:00Z',
        createdAt: '2026-09-19T12:00:00Z',
      },
    ],
    totalCount: 1,
    page: 1,
    totalPages: 1,
    pageSize: 5,
  };

  const mockDetailsResult = {
    id: 'exp-1',
    groupId: 'grp-1',
    description: 'Dinner',
    totalAmount: 2000,
    currency: 'INR',
    paidByUserId: 'u-1',
    payerName: 'Alice',
    createdByUserId: 'u-1',
    creatorName: 'Alice',
    splitType: 'equal' as const,
    expenseDate: '2026-09-19T12:00:00Z',
    createdAt: '2026-09-19T12:00:00Z',
    splits: [
      { userId: 'u-1', displayName: 'Alice', amount: 1000, percentage: null, shares: null },
      { userId: 'u-2', displayName: 'Bob', amount: 1000, percentage: null, shares: null },
    ],
    canManage: true,
    hasRepayments: false,
  };

  beforeEach(() => {
    expenseEditStateManager.clearAll();
    expenseStateManager.clearAll();

    services = {
      expenseService: {
        getExpenseHistoryForTelegram: vi.fn().mockResolvedValue(mockHistoryResult),
        getExpenseDetailsForTelegram: vi.fn().mockResolvedValue(mockDetailsResult),
        softDeleteExpenseForTelegram: vi.fn().mockResolvedValue({
          alreadyDeleted: false,
          expense: { id: 'exp-1', description: 'Dinner', total_amount: 2000 },
        }),
        updateExpenseDescriptionForTelegram: vi.fn().mockResolvedValue({
          id: 'exp-1',
          description: 'New Dinner',
        }),
      } as any,
      groupService: {} as any,
      userService: {} as any,
      balanceService: {} as any,
      settlementService: {} as any,
    };
  });

  it('renders history on action:expenses', async () => {
    const ctx = createMockContext({ callbackQuery: { data: 'action:expenses' } as any });
    const handled = await handleExpenseManagementCallback(ctx, 'action:expenses', services);

    expect(handled).toBe(true);
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(services.expenseService.getExpenseHistoryForTelegram).toHaveBeenCalledWith(1001, 2001, 1);
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('Dinner'),
      expect.objectContaining({ parse_mode: 'Markdown' })
    );
  });

  it('handles pagination callback expm:p:2', async () => {
    const ctx = createMockContext({ callbackQuery: { data: 'expm:p:2' } as any });
    const handled = await handleExpenseManagementCallback(ctx, 'expm:p:2', services);

    expect(handled).toBe(true);
    expect(services.expenseService.getExpenseHistoryForTelegram).toHaveBeenCalledWith(1001, 2001, 2);
  });

  it('views expense details with edit and delete buttons when canManage is true', async () => {
    const ctx = createMockContext({ callbackQuery: { data: 'expm:v:exp-1:1' } as any });
    const handled = await handleExpenseManagementCallback(ctx, 'expm:v:exp-1:1', services);

    expect(handled).toBe(true);
    expect(services.expenseService.getExpenseDetailsForTelegram).toHaveBeenCalledWith(1001, 2001, 'exp-1');
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('Expense Details'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ text: '✏️ Edit' }),
              expect.objectContaining({ text: '🗑 Delete' }),
            ]),
          ]),
        }),
      })
    );
  });

  it('views expense details without edit/delete buttons when canManage is false', async () => {
    vi.mocked(services.expenseService.getExpenseDetailsForTelegram).mockResolvedValue({
      ...mockDetailsResult,
      canManage: false,
    });

    const ctx = createMockContext({ callbackQuery: { data: 'expm:v:exp-1:1' } as any });
    await handleExpenseManagementCallback(ctx, 'expm:v:exp-1:1', services);

    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('Expense Details'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: [
            [expect.objectContaining({ text: '⬅️ Back to Expenses' })],
          ],
        }),
      })
    );
  });

  it('prompts delete confirmation on expm:dp', async () => {
    const ctx = createMockContext({ callbackQuery: { data: 'expm:dp:exp-1:1' } as any });
    const handled = await handleExpenseManagementCallback(ctx, 'expm:dp:exp-1:1', services);

    expect(handled).toBe(true);
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('Delete this expense?'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ text: '❌ Cancel' }),
              expect.objectContaining({ text: '🗑 Confirm Delete' }),
            ]),
          ]),
        }),
      })
    );
  });

  it('rejects delete prompt if repayments exist', async () => {
    vi.mocked(services.expenseService.getExpenseDetailsForTelegram).mockResolvedValue({
      ...mockDetailsResult,
      hasRepayments: true,
    });

    const ctx = createMockContext({ callbackQuery: { data: 'expm:dp:exp-1:1' } as any });
    await handleExpenseManagementCallback(ctx, 'expm:dp:exp-1:1', services);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('repayment activity'),
        show_alert: true,
      })
    );
    expect(ctx.editMessageText).not.toHaveBeenCalled();
  });

  it('confirms deletion on expm:dc and shows updated balance message', async () => {
    const ctx = createMockContext({ callbackQuery: { data: 'expm:dc:exp-1:1' } as any });
    const handled = await handleExpenseManagementCallback(ctx, 'expm:dc:exp-1:1', services);

    expect(handled).toBe(true);
    expect(services.expenseService.softDeleteExpenseForTelegram).toHaveBeenCalledWith(1001, 2001, 'exp-1');
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('has been deleted'),
      expect.any(Object)
    );
  });

  it('handles idempotent double delete on expm:dc', async () => {
    vi.mocked(services.expenseService.softDeleteExpenseForTelegram).mockResolvedValue({
      alreadyDeleted: true,
      expense: { id: 'exp-1', description: 'Dinner', total_amount: 2000 } as any,
    });

    const ctx = createMockContext({ callbackQuery: { data: 'expm:dc:exp-1:1' } as any });
    await handleExpenseManagementCallback(ctx, 'expm:dc:exp-1:1', services);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'This expense is already deleted.',
        show_alert: true,
      })
    );
  });

  it('shows edit menu with financial options if no repayments exist', async () => {
    const ctx = createMockContext({ callbackQuery: { data: 'expm:em:exp-1:1' } as any });
    await handleExpenseManagementCallback(ctx, 'expm:em:exp-1:1', services);

    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('Edit Expense'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            [expect.objectContaining({ text: '📝 Edit Description' })],
            [expect.objectContaining({ text: '💰 Edit Amount & Splits' })],
          ]),
        }),
      })
    );
  });

  it('disables financial editing in edit menu if repayments exist', async () => {
    vi.mocked(services.expenseService.getExpenseDetailsForTelegram).mockResolvedValue({
      ...mockDetailsResult,
      hasRepayments: true,
    });

    const ctx = createMockContext({ callbackQuery: { data: 'expm:em:exp-1:1' } as any });
    await handleExpenseManagementCallback(ctx, 'expm:em:exp-1:1', services);

    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('related repayments'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            [expect.objectContaining({ text: '📝 Edit Description' })],
            [expect.objectContaining({ text: '⬅️ Back to Expense' })],
          ]),
        }),
      })
    );
  });

  it('prompts description edit on expm:ed and saves state', async () => {
    const ctx = createMockContext({ callbackQuery: { data: 'expm:ed:exp-1:1' } as any });
    await handleExpenseManagementCallback(ctx, 'expm:ed:exp-1:1', services);

    const state = expenseEditStateManager.getState(1001, 2001);
    expect(state).not.null;
    expect(state?.expenseId).toBe('exp-1');
    expect(state?.step).toBe('AWAITING_NEW_DESCRIPTION');
  });

  it('handles text input during description edit', async () => {
    expenseEditStateManager.setState({
      chatId: 1001,
      userId: 2001,
      expenseId: 'exp-1',
      page: 1,
      step: 'AWAITING_NEW_DESCRIPTION',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const ctx = createMockContext({
      message: { text: 'New Pizza Dinner' } as any,
    });

    const handled = await handleExpenseEditTextInput(ctx, services);

    expect(handled).toBe(true);
    expect(services.expenseService.updateExpenseDescriptionForTelegram).toHaveBeenCalledWith(
      1001,
      2001,
      'exp-1',
      'New Pizza Dinner'
    );
    expect(expenseEditStateManager.getState(1001, 2001)).toBeNull();
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('New Pizza Dinner'),
      expect.any(Object)
    );
  });

  it('cancels description edit on /cancel', async () => {
    expenseEditStateManager.setState({
      chatId: 1001,
      userId: 2001,
      expenseId: 'exp-1',
      page: 1,
      step: 'AWAITING_NEW_DESCRIPTION',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const ctx = createMockContext({
      message: { text: '/cancel' } as any,
    });

    const handled = await handleExpenseEditTextInput(ctx, services);

    expect(handled).toBe(true);
    expect(expenseEditStateManager.getState(1001, 2001)).toBeNull();
    expect(ctx.reply).toHaveBeenCalledWith('❌ Expense editing cancelled.');
  });
});
