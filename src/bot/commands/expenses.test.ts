import { describe, it, expect, vi } from 'vitest';
import { Context } from 'grammy';
import { createExpensesCommandHandler } from './expenses';
import { BotServices } from '../../modules/services';

describe('/expenses Command Handler', () => {
  it('rejects execution when used in private chat', async () => {
    const ctx = {
      chat: { id: 100, type: 'private' },
      from: { id: 200 },
      reply: vi.fn(),
    } as unknown as Context;

    const services = {
      expenseService: {
        getExpenseHistoryForTelegram: vi.fn(),
      },
    } as unknown as BotServices;

    const handler = createExpensesCommandHandler(services);
    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('⚠️ Expense history is only available inside a group.');
    expect(services.expenseService.getExpenseHistoryForTelegram).not.toHaveBeenCalled();
  });

  it('renders expense history when used in a group chat', async () => {
    const ctx = {
      chat: { id: 100, type: 'group', title: 'Trip' },
      from: { id: 200 },
      reply: vi.fn(),
    } as unknown as Context;

    const services = {
      expenseService: {
        getExpenseHistoryForTelegram: vi.fn().mockResolvedValue({
          expenses: [
            {
              id: 'exp-1',
              description: 'Groceries',
              totalAmount: 1500,
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
        }),
      },
    } as unknown as BotServices;

    const handler = createExpensesCommandHandler(services);
    await handler(ctx);

    expect(services.expenseService.getExpenseHistoryForTelegram).toHaveBeenCalledWith(100, 200, 1);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Groceries'),
      expect.objectContaining({
        parse_mode: 'Markdown',
        reply_markup: expect.any(Object),
      })
    );
  });
});
