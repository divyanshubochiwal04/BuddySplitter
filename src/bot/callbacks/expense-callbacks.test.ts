import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleExpenseCallback } from './expense-callbacks';
import { expenseStateManager, ExpenseDraft } from '../../modules/expenses/expense-state';
import { BotServices } from '../../modules/services';
import { Context } from 'grammy';

describe('Expense Callbacks - Quick Add & Change Flow', () => {
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
      updateExpenseFromDraft: vi.fn().mockResolvedValue({ id: 'exp-updated' }),
    },
  } as unknown as BotServices;

  beforeEach(() => {
    expenseStateManager.clearAll();
    vi.clearAllMocks();
  });

  it('handles expired state: shows alert when session is expired or not found', async () => {
    const answerCallbackMock = vi.fn().mockResolvedValue(true);
    const mockCtx = {
      chat: { id: chatId },
      from: { id: userId },
      answerCallbackQuery: answerCallbackMock,
    } as unknown as Context;

    const handled = await handleExpenseCallback(mockCtx, 'exp:confirm', mockServices);

    expect(handled).toBe(true);
    expect(answerCallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('This expense session has expired'),
        show_alert: true,
      })
    );
  });

  it('cancels active draft cleanly on exp:cancel from any state', async () => {
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

  it('saves expense and renders confirmation on exp:confirm', async () => {
    expenseStateManager.setState({
      chatId,
      userId,
      groupId: 'g-1',
      creatorUserId: 'u-dev',
      step: 'AWAITING_CONFIRMATION',
      description: 'Dinner',
      totalAmount: 120000,
      payerUserId: 'u-dev',
      payerName: 'Dev',
      participantUserIds: ['u-dev', 'u-rahul'],
      splitType: 'equal',
      splits: [
        { userId: 'u-dev', name: 'Dev', amount: 60000 },
        { userId: 'u-rahul', name: 'Rahul', amount: 60000 },
      ],
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

    const handled = await handleExpenseCallback(mockCtx, 'exp:confirm', mockServices);

    expect(handled).toBe(true);
    expect(mockServices.expenseService.createExpenseFromDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Dinner',
        totalAmount: 120000,
        payerUserId: 'u-dev',
      })
    );
    expect(editMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('Expense added!'),
      expect.anything()
    );
    expect(expenseStateManager.getState(chatId, userId)).toBeNull();
  });

  it('enforces idempotency: rejects duplicate exp:confirm while in SAVING state', async () => {
    expenseStateManager.setState({
      chatId,
      userId,
      groupId: 'g-1',
      creatorUserId: 'u-dev',
      step: 'SAVING',
      description: 'Dinner',
      totalAmount: 120000,
      payerUserId: 'u-dev',
      payerName: 'Dev',
      participantUserIds: ['u-dev'],
      splits: [{ userId: 'u-dev', name: 'Dev', amount: 120000 }],
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

  it('navigates to change menu on exp:change', async () => {
    expenseStateManager.setState({
      chatId,
      userId,
      groupId: 'g-1',
      creatorUserId: 'u-dev',
      step: 'AWAITING_CONFIRMATION',
      description: 'Dinner',
      totalAmount: 120000,
      payerUserId: 'u-dev',
      payerName: 'Dev',
      participantUserIds: ['u-dev', 'u-rahul'],
      splitType: 'equal',
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const editMessageMock = vi.fn().mockResolvedValue(true);
    const answerCallbackMock = vi.fn().mockResolvedValue(true);
    const mockCtx = {
      chat: { id: chatId },
      from: { id: userId },
      answerCallbackQuery: answerCallbackMock,
      editMessageText: editMessageMock,
    } as unknown as Context;

    const handled = await handleExpenseCallback(mockCtx, 'exp:change', mockServices);

    expect(handled).toBe(true);
    expect(editMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('What would you like to change?'),
      expect.objectContaining({ reply_markup: expect.anything() })
    );
    expect(expenseStateManager.getState(chatId, userId)?.step).toBe('CHANGE_MENU');
  });

  it('handles changing payer: displays member options and sets new payer', async () => {
    expenseStateManager.setState({
      chatId,
      userId,
      groupId: 'g-1',
      creatorUserId: 'u-dev',
      step: 'CHANGE_MENU',
      description: 'Dinner',
      totalAmount: 120000,
      payerUserId: 'u-dev',
      payerName: 'Dev',
      participantUserIds: ['u-dev', 'u-rahul'],
      splitType: 'equal',
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const editMessageMock = vi.fn().mockResolvedValue(true);
    const answerCallbackMock = vi.fn().mockResolvedValue(true);
    const mockCtx = {
      chat: { id: chatId },
      from: { id: userId },
      answerCallbackQuery: answerCallbackMock,
      editMessageText: editMessageMock,
    } as unknown as Context;

    // 1. Open payer menu
    await handleExpenseCallback(mockCtx, 'exp:ch_payer', mockServices);
    expect(expenseStateManager.getState(chatId, userId)?.step).toBe('AWAITING_PAYER');

    // 2. Select Rahul as payer
    await handleExpenseCallback(mockCtx, 'exp:set_payer:u-rahul', mockServices);
    const updated = expenseStateManager.getState(chatId, userId);
    expect(updated?.step).toBe('AWAITING_CONFIRMATION');
    expect(updated?.payerUserId).toBe('u-rahul');
    expect(updated?.payerName).toBe('Rahul');
  });

  it('handles participant selection: toggle, select all, clear, and done', async () => {
    expenseStateManager.setState({
      chatId,
      userId,
      groupId: 'g-1',
      creatorUserId: 'u-dev',
      step: 'CHANGE_MENU',
      description: 'Dinner',
      totalAmount: 120000,
      payerUserId: 'u-dev',
      payerName: 'Dev',
      participantUserIds: ['u-dev', 'u-rahul'],
      splitType: 'equal',
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const editMessageMock = vi.fn().mockResolvedValue(true);
    const editReplyMarkupMock = vi.fn().mockResolvedValue(true);
    const answerCallbackMock = vi.fn().mockResolvedValue(true);
    const mockCtx = {
      chat: { id: chatId },
      from: { id: userId },
      answerCallbackQuery: answerCallbackMock,
      editMessageText: editMessageMock,
      editMessageReplyMarkup: editReplyMarkupMock,
    } as unknown as Context;

    // 1. Open participant selection
    await handleExpenseCallback(mockCtx, 'exp:ch_part', mockServices);
    expect(expenseStateManager.getState(chatId, userId)?.step).toBe('AWAITING_PARTICIPANTS');

    // 2. Toggle Aman in
    await handleExpenseCallback(mockCtx, 'exp:part_toggle:u-aman', mockServices);
    expect(expenseStateManager.getState(chatId, userId)?.participantUserIds).toEqual([
      'u-dev',
      'u-rahul',
      'u-aman',
    ]);

    // 3. Clear all
    await handleExpenseCallback(mockCtx, 'exp:part_clear', mockServices);
    expect(expenseStateManager.getState(chatId, userId)?.participantUserIds).toEqual([]);

    // 4. Try Done with 0 participants: alerts user and does not exit
    await handleExpenseCallback(mockCtx, 'exp:part_done', mockServices);
    expect(answerCallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('at least one participant') })
    );
    expect(expenseStateManager.getState(chatId, userId)?.step).toBe('AWAITING_PARTICIPANTS');

    // 5. Select All
    await handleExpenseCallback(mockCtx, 'exp:part_all', mockServices);
    expect(expenseStateManager.getState(chatId, userId)?.participantUserIds).toEqual([
      'u-dev',
      'u-rahul',
      'u-aman',
    ]);

    // 6. Finish with Done
    await handleExpenseCallback(mockCtx, 'exp:part_done', mockServices);
    const finalDraft = expenseStateManager.getState(chatId, userId);
    expect(finalDraft?.step).toBe('AWAITING_CONFIRMATION');
    expect(finalDraft?.splits).toHaveLength(3);
    expect(finalDraft?.splits[0].amount).toBe(40000);
  });

  it('handles split method change to Equal, Custom, and Shares', async () => {
    expenseStateManager.setState({
      chatId,
      userId,
      groupId: 'g-1',
      creatorUserId: 'u-dev',
      step: 'CHANGE_MENU',
      description: 'Dinner',
      totalAmount: 120000,
      payerUserId: 'u-dev',
      payerName: 'Dev',
      participantUserIds: ['u-dev', 'u-rahul'],
      splitType: 'equal',
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const editMessageMock = vi.fn().mockResolvedValue(true);
    const answerCallbackMock = vi.fn().mockResolvedValue(true);
    const mockCtx = {
      chat: { id: chatId },
      from: { id: userId },
      answerCallbackQuery: answerCallbackMock,
      editMessageText: editMessageMock,
    } as unknown as Context;

    // 1. Open split menu
    await handleExpenseCallback(mockCtx, 'exp:ch_split', mockServices);
    expect(expenseStateManager.getState(chatId, userId)?.step).toBe('AWAITING_SPLIT_TYPE');

    // 2. Select Custom
    await handleExpenseCallback(mockCtx, 'exp:set_split:custom', mockServices);
    expect(expenseStateManager.getState(chatId, userId)?.step).toBe('AWAITING_CUSTOM_SPLIT');

    // 3. Reset to Split menu and select Equal
    await handleExpenseCallback(mockCtx, 'exp:set_split:equal', mockServices);
    const equalDraft = expenseStateManager.getState(chatId, userId);
    expect(equalDraft?.step).toBe('AWAITING_CONFIRMATION');
    expect(equalDraft?.splitType).toBe('equal');
    expect(equalDraft?.splits).toHaveLength(2);
  });
});
