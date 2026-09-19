import { describe, it, expect, vi } from 'vitest';
import { createCallbackRouter } from './router';
import { BotServices } from '../../modules/services';
import { Context } from 'grammy';

describe('Callback Router', () => {
  it('answers coming_soon callback queries with user-friendly alert', async () => {
    const services = {} as BotServices;
    const router = createCallbackRouter(services);

    const answerCallbackQueryMock = vi.fn().mockResolvedValue(true);
    const mockCtx = {
      callbackQuery: { data: 'coming_soon:my_balance' },
      answerCallbackQuery: answerCallbackQueryMock,
      reply: vi.fn(),
    } as unknown as Context;

    await router(mockCtx);

    expect(answerCallbackQueryMock).toHaveBeenCalledWith({
      text: expect.stringContaining('My balance is coming in the next update!'),
      show_alert: true,
    });
  });

  it('routes action:add_expense to initiate expense flow', async () => {
    const mockServices = {
      userService: { registerUser: vi.fn().mockResolvedValue({ id: 'u1', firstName: 'Bob' }) },
      groupService: {
        registerGroup: vi.fn().mockResolvedValue({ id: 'g1' }),
        registerMember: vi.fn(),
        getActiveMembers: vi.fn().mockResolvedValue([{ userId: 'u1', displayName: 'Bob' }]),
      },
    } as unknown as BotServices;

    const router = createCallbackRouter(mockServices);
    const answerCallbackQueryMock = vi.fn().mockResolvedValue(true);
    const replyMock = vi.fn().mockResolvedValue(undefined);

    const mockCtx = {
      chat: { id: -100999, type: 'group' },
      from: { id: 123, first_name: 'Bob' },
      callbackQuery: { data: 'action:add_expense' },
      answerCallbackQuery: answerCallbackQueryMock,
      reply: replyMock,
    } as unknown as Context;

    await router(mockCtx);

    expect(answerCallbackQueryMock).toHaveBeenCalled();
    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('Add Expense'),
      expect.anything()
    );
  });

  it('routes action:cancel cleanly', async () => {
    const services = {} as BotServices;
    const router = createCallbackRouter(services);

    const answerCallbackQueryMock = vi.fn().mockResolvedValue(true);
    const replyMock = vi.fn().mockResolvedValue(undefined);

    const mockCtx = {
      chat: { id: -100123 },
      from: { id: 456 },
      callbackQuery: { data: 'action:cancel' },
      answerCallbackQuery: answerCallbackQueryMock,
      reply: replyMock,
      editMessageText: vi.fn().mockRejectedValue(new Error('no edit')),
    } as unknown as Context;

    await router(mockCtx);

    expect(answerCallbackQueryMock).toHaveBeenCalledWith({ text: expect.any(String) });
    expect(replyMock).toHaveBeenCalledWith('❌ Expense creation cancelled.');
  });

  it('routes action:members to fetch and display group members', async () => {
    const mockGroupService = {
      getGroupByTelegramChatId: vi.fn().mockResolvedValue({ id: 'grp-1', title: 'Flat 402' }),
      getActiveMembers: vi.fn().mockResolvedValue([{ userId: 'usr-1', displayName: 'Charlie' }]),
    };
    const mockUserService = {
      getUserById: vi.fn().mockResolvedValue({ firstName: 'Charlie', username: 'charlie' }),
    };

    const services = {
      groupService: mockGroupService,
      userService: mockUserService,
    } as unknown as BotServices;

    const router = createCallbackRouter(services);
    const answerCallbackQueryMock = vi.fn().mockResolvedValue(true);
    const replyMock = vi.fn().mockResolvedValue(undefined);

    const mockCtx = {
      chat: { id: -100555 },
      callbackQuery: { data: 'action:members' },
      answerCallbackQuery: answerCallbackQueryMock,
      reply: replyMock,
    } as unknown as Context;

    await router(mockCtx);

    expect(mockGroupService.getGroupByTelegramChatId).toHaveBeenCalledWith(-100555);
    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('Flat 402 — Active Members (1)'),
      expect.objectContaining({ parse_mode: 'Markdown' })
    );
  });

  it('gracefully answers invalid callback data without crashing', async () => {
    const services = {} as BotServices;
    const router = createCallbackRouter(services);

    const answerCallbackQueryMock = vi.fn().mockResolvedValue(true);
    const mockCtx = {
      callbackQuery: { data: '' }, // Empty string fails min(1) validation
      answerCallbackQuery: answerCallbackQueryMock,
      reply: vi.fn(),
    } as unknown as Context;

    await router(mockCtx);

    expect(answerCallbackQueryMock).toHaveBeenCalledWith({
      text: '⚠️ Invalid button action.',
      show_alert: false,
    });
  });

  it('routes action:expenses to expense management history', async () => {
    const mockExpenseService = {
      getExpenseHistoryForTelegram: vi.fn().mockResolvedValue({
        expenses: [],
        totalCount: 0,
        page: 1,
        totalPages: 1,
        pageSize: 5,
      }),
    };
    const services = { expenseService: mockExpenseService } as unknown as BotServices;
    const router = createCallbackRouter(services);

    const answerCallbackQueryMock = vi.fn().mockResolvedValue(true);
    const replyMock = vi.fn().mockResolvedValue(undefined);

    const mockCtx = {
      chat: { id: -100555, title: 'Trip' },
      from: { id: 123 },
      callbackQuery: { data: 'action:expenses' },
      answerCallbackQuery: answerCallbackQueryMock,
      reply: replyMock,
    } as unknown as Context;

    await router(mockCtx);

    expect(mockExpenseService.getExpenseHistoryForTelegram).toHaveBeenCalledWith(-100555, 123, 1);
    // Empty state message contains "No expenses yet" or full history header
    expect(replyMock).toHaveBeenCalledWith(
      expect.stringMatching(/No expenses yet|Expenses/),
      expect.any(Object)
    );
  });
});
