import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleExpenseCallback } from './expense-callbacks';
import { expenseStateManager, ExpenseDraft } from '../../modules/expenses/expense-state';
import { BotServices } from '../../modules/services';
import { Context } from 'grammy';

describe('Phase 5: Advanced Splits Callbacks & Flow', () => {
  const chatId = -100999;
  const userId = 42;

  const mockServices = {
    groupService: {
      getActiveMembers: vi.fn().mockResolvedValue([
        { userId: 'u-dev', displayName: 'Dev' },
        { userId: 'u-rahul', displayName: 'Rahul' },
        { userId: 'u-aman', displayName: 'Aman' },
      ]),
    },
    userService: {
      getUserById: vi.fn().mockImplementation(async (id: string) => {
        if (id === 'u-dev') return { firstName: 'Dev' };
        if (id === 'u-rahul') return { firstName: 'Rahul' };
        if (id === 'u-aman') return { firstName: 'Aman' };
        return null;
      }),
    },
    expenseService: {
      createExpenseFromDraft: vi.fn().mockResolvedValue({ id: 'exp-saved' }),
    },
  } as unknown as BotServices;

  beforeEach(() => {
    expenseStateManager.clearAll();
    vi.clearAllMocks();
  });

  it('handles split:shares by initializing 1 share per participant and displaying shares keyboard', async () => {
    const initialDraft: ExpenseDraft = {
      chatId,
      userId,
      groupId: 'g-1',
      creatorUserId: 'u-dev',
      step: 'AWAITING_SPLIT_TYPE',
      description: 'Team Lunch',
      totalAmount: 300000, // ₹3000
      payerUserId: 'u-dev',
      payerName: 'Dev',
      participantUserIds: ['u-dev', 'u-rahul', 'u-aman'],
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expenseStateManager.setState(initialDraft);

    const replyMock = vi.fn().mockResolvedValue(undefined);
    const answerCallbackMock = vi.fn().mockResolvedValue(true);
    const mockCtx = {
      chat: { id: chatId },
      from: { id: userId },
      answerCallbackQuery: answerCallbackMock,
      reply: replyMock,
    } as unknown as Context;

    const handled = await handleExpenseCallback(mockCtx, 'split:shares', mockServices);

    expect(handled).toBe(true);
    expect(answerCallbackMock).toHaveBeenCalled();
    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('Give each person their number of shares'),
      expect.objectContaining({ reply_markup: expect.anything() })
    );

    const updated = expenseStateManager.getState(chatId, userId);
    expect(updated?.step).toBe('AWAITING_SHARES_SPLIT');
    expect(updated?.splitType).toBe('shares');
    expect(updated?.sharesMap).toEqual({
      'u-dev': 1,
      'u-rahul': 1,
      'u-aman': 1,
    });
  });

  it('increments participant shares and updates keyboard markup', async () => {
    expenseStateManager.setState({
      chatId,
      userId,
      groupId: 'g-1',
      creatorUserId: 'u-dev',
      step: 'AWAITING_SHARES_SPLIT',
      description: 'Team Lunch',
      totalAmount: 300000,
      payerUserId: 'u-dev',
      payerName: 'Dev',
      participantUserIds: ['u-dev', 'u-rahul', 'u-aman'],
      sharesMap: { 'u-dev': 1, 'u-rahul': 1, 'u-aman': 1 },
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const editReplyMarkupMock = vi.fn().mockResolvedValue(true);
    const answerCallbackMock = vi.fn().mockResolvedValue(true);
    const mockCtx = {
      chat: { id: chatId },
      from: { id: userId },
      answerCallbackQuery: answerCallbackMock,
      editMessageReplyMarkup: editReplyMarkupMock,
    } as unknown as Context;

    // Increment Dev's shares from 1 to 2
    const handled = await handleExpenseCallback(mockCtx, 'share:inc:u-dev', mockServices);

    expect(handled).toBe(true);
    expect(editReplyMarkupMock).toHaveBeenCalled();

    const updated = expenseStateManager.getState(chatId, userId);
    expect(updated?.sharesMap?.['u-dev']).toBe(2);
    expect(updated?.sharesMap?.['u-rahul']).toBe(1);
  });

  it('prevents decrementing shares below 1 with friendly alert', async () => {
    expenseStateManager.setState({
      chatId,
      userId,
      groupId: 'g-1',
      creatorUserId: 'u-dev',
      step: 'AWAITING_SHARES_SPLIT',
      description: 'Team Lunch',
      totalAmount: 300000,
      payerUserId: 'u-dev',
      payerName: 'Dev',
      participantUserIds: ['u-dev', 'u-rahul'],
      sharesMap: { 'u-dev': 1, 'u-rahul': 1 },
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const answerCallbackMock = vi.fn().mockResolvedValue(true);
    const editReplyMarkupMock = vi.fn().mockResolvedValue(true);
    const mockCtx = {
      chat: { id: chatId },
      from: { id: userId },
      answerCallbackQuery: answerCallbackMock,
      editMessageReplyMarkup: editReplyMarkupMock,
    } as unknown as Context;

    // Try to decrement below 1
    const handled = await handleExpenseCallback(mockCtx, 'share:dec:u-dev', mockServices);

    expect(handled).toBe(true);
    expect(answerCallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Minimum share is 1') })
    );
    expect(editReplyMarkupMock).not.toHaveBeenCalled();

    const updated = expenseStateManager.getState(chatId, userId);
    expect(updated?.sharesMap?.['u-dev']).toBe(1);
  });

  it('calculates 2:1:1 shares split and renders confirmation preview', async () => {
    // Total = ₹3000 (300,000 paise). Dev = 2 shares, Rahul = 1, Aman = 1
    // Dev: ₹1500 (150,000 paise), Rahul: ₹750 (75,000 paise), Aman: ₹750 (75,000 paise)
    expenseStateManager.setState({
      chatId,
      userId,
      groupId: 'g-1',
      creatorUserId: 'u-dev',
      step: 'AWAITING_SHARES_SPLIT',
      description: 'Dinner at Bistro',
      totalAmount: 300000,
      payerUserId: 'u-dev',
      payerName: 'Dev',
      participantUserIds: ['u-dev', 'u-rahul', 'u-aman'],
      sharesMap: { 'u-dev': 2, 'u-rahul': 1, 'u-aman': 1 },
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const replyMock = vi.fn().mockResolvedValue(undefined);
    const answerCallbackMock = vi.fn().mockResolvedValue(true);
    const mockCtx = {
      chat: { id: chatId },
      from: { id: userId },
      answerCallbackQuery: answerCallbackMock,
      reply: replyMock,
    } as unknown as Context;

    const handled = await handleExpenseCallback(mockCtx, 'share:continue', mockServices);

    expect(handled).toBe(true);
    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('Method:* 🔢 Shares'),
      expect.objectContaining({ reply_markup: expect.anything() })
    );

    const updated = expenseStateManager.getState(chatId, userId);
    expect(updated?.step).toBe('AWAITING_CONFIRMATION');
    expect(updated?.splits).toHaveLength(3);
    expect(updated?.splits).toEqual([
      { userId: 'u-dev', name: 'Dev', amount: 150000, shares: 2 },
      { userId: 'u-rahul', name: 'Rahul', amount: 75000, shares: 1 },
      { userId: 'u-aman', name: 'Aman', amount: 75000, shares: 1 },
    ]);
  });

  it('allows changing split method from confirmation preserving details and discarding old splits', async () => {
    expenseStateManager.setState({
      chatId,
      userId,
      groupId: 'g-1',
      creatorUserId: 'u-dev',
      step: 'AWAITING_CONFIRMATION',
      description: 'Dinner at Bistro',
      totalAmount: 300000,
      payerUserId: 'u-dev',
      payerName: 'Dev',
      participantUserIds: ['u-dev', 'u-rahul'],
      splitType: 'equal',
      splits: [
        { userId: 'u-dev', name: 'Dev', amount: 150000 },
        { userId: 'u-rahul', name: 'Rahul', amount: 150000 },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const replyMock = vi.fn().mockResolvedValue(undefined);
    const answerCallbackMock = vi.fn().mockResolvedValue(true);
    const mockCtx = {
      chat: { id: chatId },
      from: { id: userId },
      answerCallbackQuery: answerCallbackMock,
      reply: replyMock,
    } as unknown as Context;

    const handled = await handleExpenseCallback(mockCtx, 'exp:change_split', mockServices);

    expect(handled).toBe(true);
    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('How should ₹3000.00 be split?'),
      expect.anything()
    );

    const updated = expenseStateManager.getState(chatId, userId);
    expect(updated?.step).toBe('AWAITING_SPLIT_TYPE');
    expect(updated?.description).toBe('Dinner at Bistro');
    expect(updated?.totalAmount).toBe(300000);
    expect(updated?.payerUserId).toBe('u-dev');
    expect(updated?.participantUserIds).toEqual(['u-dev', 'u-rahul']);
    expect(updated?.splits).toEqual([]);
    expect(updated?.splitType).toBeUndefined();
  });

  it('allows changing participants from confirmation, preserving description, amount, and payer', async () => {
    expenseStateManager.setState({
      chatId,
      userId,
      groupId: 'g-1',
      creatorUserId: 'u-dev',
      step: 'AWAITING_CONFIRMATION',
      description: 'Dinner at Bistro',
      totalAmount: 300000,
      payerUserId: 'u-dev',
      payerName: 'Dev',
      participantUserIds: ['u-dev', 'u-rahul'],
      splitType: 'equal',
      splits: [
        { userId: 'u-dev', name: 'Dev', amount: 150000 },
        { userId: 'u-rahul', name: 'Rahul', amount: 150000 },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const replyMock = vi.fn().mockResolvedValue(undefined);
    const answerCallbackMock = vi.fn().mockResolvedValue(true);
    const mockCtx = {
      chat: { id: chatId },
      from: { id: userId },
      answerCallbackQuery: answerCallbackMock,
      reply: replyMock,
    } as unknown as Context;

    const handled = await handleExpenseCallback(mockCtx, 'exp:change_participants', mockServices);

    expect(handled).toBe(true);
    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('Who shared this expense?'),
      expect.anything()
    );

    const updated = expenseStateManager.getState(chatId, userId);
    expect(updated?.step).toBe('AWAITING_PARTICIPANTS');
    expect(updated?.description).toBe('Dinner at Bistro');
    expect(updated?.totalAmount).toBe(300000);
    expect(updated?.payerUserId).toBe('u-dev');
    expect(updated?.splits).toEqual([]);
  });

  it('supports payer and participants being completely independent (Payer = Dev, Participants = Rahul + Aman)', async () => {
    expenseStateManager.setState({
      chatId,
      userId,
      groupId: 'g-1',
      creatorUserId: 'u-dev',
      step: 'AWAITING_CONFIRMATION',
      description: 'Dev pays for friends',
      totalAmount: 200000, // ₹2000
      payerUserId: 'u-dev',
      payerName: 'Dev',
      participantUserIds: ['u-rahul', 'u-aman'], // Dev is NOT in participants!
      splitType: 'equal',
      splits: [
        { userId: 'u-rahul', name: 'Rahul', amount: 100000 },
        { userId: 'u-aman', name: 'Aman', amount: 100000 },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const answerCallbackMock = vi.fn().mockResolvedValue(true);
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      chat: { id: chatId },
      from: { id: userId },
      answerCallbackQuery: answerCallbackMock,
      reply: replyMock,
      editMessageText: vi.fn().mockResolvedValue(true),
    } as unknown as Context;

    const handled = await handleExpenseCallback(mockCtx, 'exp:confirm', mockServices);

    expect(handled).toBe(true);
    expect(mockServices.expenseService.createExpenseFromDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        payerUserId: 'u-dev',
        participantUserIds: ['u-rahul', 'u-aman'],
      })
    );
    expect(expenseStateManager.getState(chatId, userId)).toBeNull(); // Cleaned up after save
  });

  it('enforces idempotency: rejects duplicate exp:confirm while in SAVING state', async () => {
    expenseStateManager.setState({
      chatId,
      userId,
      groupId: 'g-1',
      creatorUserId: 'u-dev',
      step: 'SAVING',
      description: 'Trip',
      totalAmount: 100000,
      payerUserId: 'u-dev',
      payerName: 'Dev',
      participantUserIds: ['u-dev'],
      splits: [{ userId: 'u-dev', name: 'Dev', amount: 100000 }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const answerCallbackMock = vi.fn().mockResolvedValue(true);
    const mockCtx = {
      chat: { id: chatId },
      from: { id: userId },
      answerCallbackQuery: answerCallbackMock,
    } as unknown as Context;

    const handled = await handleExpenseCallback(mockCtx, 'exp:confirm', mockServices);

    expect(handled).toBe(true);
    expect(answerCallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('already in progress') })
    );
    expect(mockServices.expenseService.createExpenseFromDraft).not.toHaveBeenCalled();
  });

  it('cancels active draft cleanly on exp:cancel', async () => {
    expenseStateManager.setState({
      chatId,
      userId,
      groupId: 'g-1',
      creatorUserId: 'u-dev',
      step: 'AWAITING_CONFIRMATION',
      participantUserIds: ['u-dev'],
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const answerCallbackMock = vi.fn().mockResolvedValue(true);
    const editMessageMock = vi.fn().mockResolvedValue(true);
    const mockCtx = {
      chat: { id: chatId },
      from: { id: userId },
      answerCallbackQuery: answerCallbackMock,
      editMessageText: editMessageMock,
      reply: vi.fn(),
    } as unknown as Context;

    const handled = await handleExpenseCallback(mockCtx, 'exp:cancel', mockServices);

    expect(handled).toBe(true);
    expect(answerCallbackMock).toHaveBeenCalled();
    expect(editMessageMock).toHaveBeenCalledWith('❌ Expense creation cancelled.');
    expect(expenseStateManager.getState(chatId, userId)).toBeNull();
  });
});
