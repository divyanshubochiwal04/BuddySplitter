import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  startExpenseFlow,
  startQuickAdd,
  startExpenseFromParsedInput,
  handleAddCommand,
  handleExpenseTextInput,
  extractAddCommandArgs,
} from './expense-flow';
import { expenseStateManager, ExpenseDraft } from './expense-state';
import { BotServices } from '../services';
import { Context, CommandContext } from 'grammy';
import {
  QUICK_ADD_PROMPT,
  CMD_ADD_MISSING_AMOUNT_MESSAGE,
  CMD_ADD_INVALID_AMOUNT_MESSAGE,
  QUICK_ADD_MISSING_AMOUNT_MESSAGE,
  QUICK_ADD_INVALID_AMOUNT_MESSAGE,
  QUICK_ADD_MISSING_DESCRIPTION_MESSAGE,
  QUICK_ADD_MALFORMED_MESSAGE,
  UNEXPECTED_INPUT_MESSAGE,
} from '../../bot/messages/expense';

describe('Expense Flow - Quick Add & Replacement UX', () => {
  const chatId = -1001234;
  const userId = 456;

  const mockServices = {
    userService: {
      registerUser: vi.fn().mockResolvedValue({ id: 'db-u1', firstName: 'Bob' }),
      getUserById: vi.fn().mockImplementation(async (id: string) => {
        if (id === 'db-u1') return { firstName: 'Bob' };
        if (id === 'db-u2') return { firstName: 'Alice' };
        return null;
      }),
    },
    groupService: {
      registerGroup: vi.fn().mockResolvedValue({ id: 'db-g1', title: 'Flatmates' }),
      registerMember: vi.fn().mockResolvedValue({ id: 'db-gm1' }),
      getActiveMembers: vi.fn().mockResolvedValue([
        { userId: 'db-u1', displayName: 'Bob' },
        { userId: 'db-u2', displayName: 'Alice' },
      ]),
    },
  } as unknown as BotServices;

  function seedDraft(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
    const draft: ExpenseDraft = {
      chatId,
      userId,
      groupId: 'db-g1',
      creatorUserId: 'db-u1',
      step: 'AWAITING_QUICK_ADD',
      payerUserId: 'db-u1',
      payerName: 'Bob',
      participantUserIds: ['db-u1', 'db-u2'],
      splitType: 'equal',
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    };
    expenseStateManager.setState(draft);
    return draft;
  }

  function createTextContext(text: string) {
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      chat: { id: chatId, type: 'group' },
      from: { id: userId, first_name: 'Bob' },
      message: { text },
      reply: replyMock,
    } as unknown as Context;
    return { ctx, replyMock };
  }

  beforeEach(() => {
    expenseStateManager.clearAll();
    vi.clearAllMocks();
  });

  it('rejects starting expense flow in private chat', async () => {
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      chat: { id: 123, type: 'private' },
      from: { id: 123, first_name: 'Alice' },
      reply: replyMock,
    } as unknown as Context;

    await startExpenseFlow(mockCtx, {} as BotServices);

    expect(replyMock).toHaveBeenCalledWith('⚠️ Expenses can only be added inside a group.');
    expect(expenseStateManager.getState(123, 123)).toBeNull();
  });

  it('starts flow with /add (no arguments): shows Quick Add prompt and sets AWAITING_QUICK_ADD', async () => {
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      chat: { id: chatId, type: 'group', title: 'Flatmates' },
      from: { id: userId, first_name: 'Bob' },
      reply: replyMock,
    } as unknown as Context;

    await startExpenseFlow(mockCtx, mockServices);

    expect(replyMock).toHaveBeenCalledWith(
      QUICK_ADD_PROMPT,
      expect.objectContaining({
        parse_mode: 'Markdown',
        reply_markup: expect.anything(),
      })
    );

    const draft = expenseStateManager.getState(chatId, userId);
    expect(draft).not.toBeNull();
    expect(draft?.step).toBe('AWAITING_QUICK_ADD');
    expect(draft?.participantUserIds).toEqual(['db-u1', 'db-u2']);
    expect(draft?.payerUserId).toBe('db-u1');
  });

  it('starts flow with /add Dinner 1200: immediately parses and shows confirmation', async () => {
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      chat: { id: chatId, type: 'group', title: 'Flatmates' },
      from: { id: userId, first_name: 'Bob' },
      reply: replyMock,
    } as unknown as Context;

    await startExpenseFlow(mockCtx, mockServices, 'Dinner 1200');

    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('Dinner'),
      expect.objectContaining({
        parse_mode: 'Markdown',
        reply_markup: expect.anything(),
      })
    );

    const draft = expenseStateManager.getState(chatId, userId);
    expect(draft?.step).toBe('AWAITING_CONFIRMATION');
    expect(draft?.description).toBe('Dinner');
    expect(draft?.totalAmount).toBe(120000);
    expect(draft?.splits).toHaveLength(2);
    expect(draft?.splits[0].amount).toBe(60000);
  });

  it('handles "Dinner 1200" text input in AWAITING_QUICK_ADD state', async () => {
    seedDraft();
    const { ctx, replyMock } = createTextContext('Dinner 1200');

    const handled = await handleExpenseTextInput(ctx, mockServices);

    expect(handled).toBe(true);
    expect(replyMock).toHaveBeenCalledWith(expect.stringContaining('Dinner'), expect.anything());

    const draft = expenseStateManager.getState(chatId, userId);
    expect(draft?.step).toBe('AWAITING_CONFIRMATION');
    expect(draft?.description).toBe('Dinner');
    expect(draft?.totalAmount).toBe(120000);
  });

  it('handles "Cab 450" text input in AWAITING_QUICK_ADD state', async () => {
    seedDraft();
    const { ctx } = createTextContext('Cab 450');

    const handled = await handleExpenseTextInput(ctx, mockServices);

    expect(handled).toBe(true);
    const draft = expenseStateManager.getState(chatId, userId);
    expect(draft?.step).toBe('AWAITING_CONFIRMATION');
    expect(draft?.description).toBe('Cab');
    expect(draft?.totalAmount).toBe(45000);
  });

  it('handles Telegram special characters in description (e.g. Dinner_with*friends [Bar_1] 800)', async () => {
    seedDraft();
    const { ctx } = createTextContext('Dinner_with*friends [Bar_1] 800');

    const handled = await handleExpenseTextInput(ctx, mockServices);

    expect(handled).toBe(true);
    const draft = expenseStateManager.getState(chatId, userId);
    expect(draft?.description).toBe('Dinner_with*friends [Bar_1]');
    expect(draft?.totalAmount).toBe(80000);
  });

  it('shows missing amount error when user sends description only', async () => {
    seedDraft();
    const { ctx, replyMock } = createTextContext('Dinner');

    const handled = await handleExpenseTextInput(ctx, mockServices);

    expect(handled).toBe(true);
    expect(replyMock).toHaveBeenCalledWith(
      QUICK_ADD_MISSING_AMOUNT_MESSAGE,
      expect.objectContaining({ reply_markup: expect.anything() })
    );

    expect(expenseStateManager.getState(chatId, userId)?.step).toBe('AWAITING_QUICK_ADD');
  });

  it('shows invalid amount error when user sends negative or zero amount', async () => {
    seedDraft();
    const { ctx, replyMock } = createTextContext('Dinner -50');

    const handled = await handleExpenseTextInput(ctx, mockServices);

    expect(handled).toBe(true);
    expect(replyMock).toHaveBeenCalledWith(
      QUICK_ADD_INVALID_AMOUNT_MESSAGE,
      expect.objectContaining({ reply_markup: expect.anything() })
    );
  });

  it('shows missing description error when user sends only numbers', async () => {
    seedDraft();
    const { ctx, replyMock } = createTextContext('1200');

    const handled = await handleExpenseTextInput(ctx, mockServices);

    expect(handled).toBe(true);
    expect(replyMock).toHaveBeenCalledWith(
      QUICK_ADD_MISSING_DESCRIPTION_MESSAGE,
      expect.objectContaining({ reply_markup: expect.anything() })
    );
  });

  it('shows invalid amount error when user sends non-numeric amount like "Dinner 12a"', async () => {
    seedDraft();
    const { ctx, replyMock } = createTextContext('Dinner 12a');

    const handled = await handleExpenseTextInput(ctx, mockServices);

    expect(handled).toBe(true);
    expect(replyMock).toHaveBeenCalledWith(
      QUICK_ADD_INVALID_AMOUNT_MESSAGE,
      expect.objectContaining({ reply_markup: expect.anything() })
    );
  });

  it('shows malformed error when description exceeds 100 characters', async () => {
    seedDraft();
    const tooLong = 'A'.repeat(101) + ' 500';
    const { ctx, replyMock } = createTextContext(tooLong);

    const handled = await handleExpenseTextInput(ctx, mockServices);

    expect(handled).toBe(true);
    expect(replyMock).toHaveBeenCalledWith(
      QUICK_ADD_MALFORMED_MESSAGE,
      expect.objectContaining({ reply_markup: expect.anything() })
    );
  });

  it('allows updating description in AWAITING_NEW_DESCRIPTION and returns to confirmation', async () => {
    seedDraft({
      step: 'AWAITING_NEW_DESCRIPTION',
      description: 'Old Description',
      totalAmount: 120000,
    });
    const { ctx, replyMock } = createTextContext('New Dinner with Team');

    const handled = await handleExpenseTextInput(ctx, mockServices);

    expect(handled).toBe(true);
    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('New Dinner with Team'),
      expect.anything()
    );

    const draft = expenseStateManager.getState(chatId, userId);
    expect(draft?.step).toBe('AWAITING_CONFIRMATION');
    expect(draft?.description).toBe('New Dinner with Team');
  });

  it('allows updating amount in AWAITING_NEW_AMOUNT, recalculates split, and returns to confirmation', async () => {
    seedDraft({
      step: 'AWAITING_NEW_AMOUNT',
      description: 'Dinner',
      totalAmount: 120000,
    });
    const { ctx } = createTextContext('2000');

    const handled = await handleExpenseTextInput(ctx, mockServices);

    expect(handled).toBe(true);
    const draft = expenseStateManager.getState(chatId, userId);
    expect(draft?.step).toBe('AWAITING_CONFIRMATION');
    expect(draft?.totalAmount).toBe(200000);
    expect(draft?.splits[0].amount).toBe(100000);
  });

  it('responds with UNEXPECTED_INPUT_MESSAGE when user types text in button states', async () => {
    seedDraft({
      step: 'AWAITING_CONFIRMATION',
      description: 'Dinner',
      totalAmount: 120000,
    });
    const { ctx, replyMock } = createTextContext('hello bot');

    const handled = await handleExpenseTextInput(ctx, mockServices);

    expect(handled).toBe(true);
    expect(replyMock).toHaveBeenCalledWith(
      UNEXPECTED_INPUT_MESSAGE,
      expect.objectContaining({ reply_markup: expect.anything() })
    );
  });

  it('clears state on /cancel message and does not consume command', async () => {
    seedDraft();
    const { ctx } = createTextContext('/cancel');

    const handled = await handleExpenseTextInput(ctx, mockServices);

    expect(handled).toBe(false);
    expect(expenseStateManager.getState(chatId, userId)).toBeNull();
  });

  it('cross-group isolation: drafts for different groups and users do not collide', async () => {
    expenseStateManager.setState({
      chatId: -1001,
      userId: 10,
      groupId: 'g-1',
      creatorUserId: 'u-1',
      step: 'AWAITING_QUICK_ADD',
      participantUserIds: ['u-1'],
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expenseStateManager.setState({
      chatId: -1002,
      userId: 20,
      groupId: 'g-2',
      creatorUserId: 'u-2',
      step: 'AWAITING_QUICK_ADD',
      participantUserIds: ['u-2'],
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(expenseStateManager.getState(-1001, 10)?.groupId).toBe('g-1');
    expect(expenseStateManager.getState(-1002, 20)?.groupId).toBe('g-2');
  });

  describe('Production Bug Regression Suite: /add arguments handling', () => {
    function createCommandContext(text: string, matchPayload?: string) {
      const replyMock = vi.fn().mockResolvedValue(undefined);
      const ctx = {
        chat: { id: chatId, type: 'group', title: 'Flatmates' },
        from: { id: userId, first_name: 'Bob' },
        message: { text },
        match: matchPayload !== undefined ? matchPayload : text.replace(/^\/add(?:@\w+)?\s*/i, ''),
        reply: replyMock,
      } as unknown as CommandContext<Context>;
      return { ctx, replyMock };
    }

    it('1. /add dinner 1200 parses immediately, shows confirmation, and sets AWAITING_CONFIRMATION', async () => {
      const { ctx, replyMock } = createCommandContext('/add dinner 1200', 'dinner 1200');

      await handleAddCommand(ctx, mockServices);

      expect(replyMock).toHaveBeenCalledTimes(1);
      const replyMessage = replyMock.mock.calls[0][0];
      expect(replyMessage).toContain('dinner');
      expect(replyMessage).toContain('1,200');
      expect(replyMessage).not.toContain('What was this expense for?');

      const draft = expenseStateManager.getState(chatId, userId);
      expect(draft).not.toBeNull();
      expect(draft?.step).toBe('AWAITING_CONFIRMATION');
      expect(draft?.description).toBe('dinner');
      expect(draft?.totalAmount).toBe(120000);
      expect(draft?.splitType).toBe('equal');
      expect(draft?.payerUserId).toBe('db-u1');
      expect(draft?.participantUserIds).toEqual(['db-u1', 'db-u2']);
    });

    it('2. /add pent 800 parses immediately and shows confirmation', async () => {
      const { ctx, replyMock } = createCommandContext('/add pent 800', 'pent 800');

      await handleAddCommand(ctx, mockServices);

      expect(replyMock).toHaveBeenCalledTimes(1);
      const replyMessage = replyMock.mock.calls[0][0];
      expect(replyMessage).toContain('pent');
      expect(replyMessage).toContain('800');

      const draft = expenseStateManager.getState(chatId, userId);
      expect(draft?.step).toBe('AWAITING_CONFIRMATION');
      expect(draft?.description).toBe('pent');
      expect(draft?.totalAmount).toBe(80000);
    });

    it('3. /add without arguments prompts for quick-add and waits for text input', async () => {
      const { ctx, replyMock } = createCommandContext('/add', '');

      await handleAddCommand(ctx, mockServices);

      expect(replyMock).toHaveBeenCalledWith(
        QUICK_ADD_PROMPT,
        expect.objectContaining({ reply_markup: expect.anything() })
      );

      const draft = expenseStateManager.getState(chatId, userId);
      expect(draft).not.toBeNull();
      expect(draft?.step).toBe('AWAITING_QUICK_ADD');
    });

    it('4. /add dinner shows actionable missing amount error and does not create draft', async () => {
      const { ctx, replyMock } = createCommandContext('/add dinner', 'dinner');

      await handleAddCommand(ctx, mockServices);

      expect(replyMock).toHaveBeenCalledWith(
        CMD_ADD_MISSING_AMOUNT_MESSAGE,
        expect.anything()
      );

      // Must NOT silently create draft or start description state
      expect(expenseStateManager.getState(chatId, userId)).toBeNull();
    });

    it('5. /add dinner abc shows actionable invalid amount error and does not create draft', async () => {
      const { ctx, replyMock } = createCommandContext('/add dinner abc', 'dinner abc');

      await handleAddCommand(ctx, mockServices);

      expect(replyMock).toHaveBeenCalledWith(
        CMD_ADD_INVALID_AMOUNT_MESSAGE,
        expect.anything()
      );

      expect(expenseStateManager.getState(chatId, userId)).toBeNull();
    });

    it('6. Add Expense button + "Dinner 1200" shows confirmation', async () => {
      const buttonReplyMock = vi.fn().mockResolvedValue(undefined);
      const buttonCtx = {
        chat: { id: chatId, type: 'group', title: 'Flatmates' },
        from: { id: userId, first_name: 'Bob' },
        reply: buttonReplyMock,
      } as unknown as Context;

      await startQuickAdd(buttonCtx, mockServices);

      expect(expenseStateManager.getState(chatId, userId)?.step).toBe('AWAITING_QUICK_ADD');

      const { ctx: textCtx, replyMock: textReplyMock } = createTextContext('Dinner 1200');
      const handled = await handleExpenseTextInput(textCtx, mockServices);

      expect(handled).toBe(true);
      expect(textReplyMock).toHaveBeenCalledWith(
        expect.stringContaining('Dinner'),
        expect.anything()
      );
      expect(expenseStateManager.getState(chatId, userId)?.step).toBe('AWAITING_CONFIRMATION');
    });

    it('7. Add Expense button + "Dinner" shows missing amount error and does not repeat "What was this expense for?"', async () => {
      const buttonReplyMock = vi.fn().mockResolvedValue(undefined);
      const buttonCtx = {
        chat: { id: chatId, type: 'group', title: 'Flatmates' },
        from: { id: userId, first_name: 'Bob' },
        reply: buttonReplyMock,
      } as unknown as Context;

      await startQuickAdd(buttonCtx, mockServices);

      const { ctx: textCtx, replyMock: textReplyMock } = createTextContext('Dinner');
      const handled = await handleExpenseTextInput(textCtx, mockServices);

      expect(handled).toBe(true);
      expect(textReplyMock).toHaveBeenCalledWith(
        QUICK_ADD_MISSING_AMOUNT_MESSAGE,
        expect.anything()
      );
      const replyText = textReplyMock.mock.calls[0][0];
      expect(replyText).not.toContain('What was this expense for?');
      expect(expenseStateManager.getState(chatId, userId)?.step).toBe('AWAITING_QUICK_ADD');
    });

    it('8. /add dinner 1200 must NEVER produce "What was this expense for?"', async () => {
      const { ctx, replyMock } = createCommandContext('/add dinner 1200', 'dinner 1200');

      await handleAddCommand(ctx, mockServices);

      const calls = replyMock.mock.calls;
      for (const call of calls) {
        expect(call[0]).not.toContain('What was this expense for?');
      }
    });

    it('9. /add dinner 1200 does not create duplicate draft/session when run repeatedly', async () => {
      const { ctx: ctx1 } = createCommandContext('/add lunch 500', 'lunch 500');
      await handleAddCommand(ctx1, mockServices);

      const { ctx: ctx2 } = createCommandContext('/add dinner 1200', 'dinner 1200');
      await handleAddCommand(ctx2, mockServices);

      const draft = expenseStateManager.getState(chatId, userId);
      expect(draft?.description).toBe('dinner');
      expect(draft?.totalAmount).toBe(120000);
    });

    it('10. Cancel works after /add or during quick add', async () => {
      const { ctx: addCtx } = createCommandContext('/add', '');
      await handleAddCommand(addCtx, mockServices);
      expect(expenseStateManager.getState(chatId, userId)).not.toBeNull();

      const { ctx: cancelCtx } = createTextContext('/cancel');
      const handled = await handleExpenseTextInput(cancelCtx, mockServices);

      expect(handled).toBe(false); // lets cancel command proceed
      expect(expenseStateManager.getState(chatId, userId)).toBeNull();
    });

    it('11. Multiple users and groups remain strictly isolated', async () => {
      const { ctx: ctxUser1Group1 } = createCommandContext('/add pizza 600', 'pizza 600');
      await handleAddCommand(ctxUser1Group1, mockServices);

      const ctxUser2Group1 = {
        chat: { id: chatId, type: 'group' },
        from: { id: 789, first_name: 'Alice' },
        message: { text: '/add sushi 1500' },
        match: 'sushi 1500',
        reply: vi.fn(),
      } as unknown as CommandContext<Context>;
      await handleAddCommand(ctxUser2Group1, mockServices);

      const draft1 = expenseStateManager.getState(chatId, userId);
      const draft2 = expenseStateManager.getState(chatId, 789);

      expect(draft1?.description).toBe('pizza');
      expect(draft2?.description).toBe('sushi');
    });

    it('12. extractAddCommandArgs extracts from match or message text correctly', () => {
      const ctxWithMatch = { match: 'dinner 1200', message: { text: '/add dinner 1200' } } as unknown as Context;
      expect(extractAddCommandArgs(ctxWithMatch)).toBe('dinner 1200');

      const ctxWithBotMention = { match: '', message: { text: '/add@MyBuddyBot pent 800' } } as unknown as Context;
      expect(extractAddCommandArgs(ctxWithBotMention)).toBe('pent 800');

      const ctxNoArgs = { match: '', message: { text: '/add' } } as unknown as Context;
      expect(extractAddCommandArgs(ctxNoArgs)).toBe('');
    });
  });
});
