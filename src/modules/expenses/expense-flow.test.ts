import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startExpenseFlow, handleExpenseTextInput } from './expense-flow';
import { expenseStateManager, ExpenseDraft } from './expense-state';
import { BotServices } from '../services';
import { Context } from 'grammy';
import {
  QUICK_ADD_PROMPT,
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

  it('shows malformed error when user sends unparseable input', async () => {
    seedDraft();
    const { ctx, replyMock } = createTextContext('Dinner 12a');

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
});
