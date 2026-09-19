import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startExpenseFlow, handleExpenseTextInput } from './expense-flow';
import { expenseStateManager } from './expense-state';
import { BotServices } from '../services';
import { Context } from 'grammy';

describe('Expense Flow', () => {
  beforeEach(() => {
    expenseStateManager.clearAll();
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

  it('starts expense flow in group chat and transitions to AWAITING_DESCRIPTION', async () => {
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      chat: { id: -1001234, type: 'group', title: 'Flatmates' },
      from: { id: 456, first_name: 'Bob' },
      reply: replyMock,
    } as unknown as Context;

    const mockServices = {
      userService: {
        registerUser: vi.fn().mockResolvedValue({ id: 'db-u1', firstName: 'Bob' }),
      },
      groupService: {
        registerGroup: vi.fn().mockResolvedValue({ id: 'db-g1', title: 'Flatmates' }),
        registerMember: vi.fn().mockResolvedValue({ id: 'db-gm1' }),
      },
    } as unknown as BotServices;

    await startExpenseFlow(mockCtx, mockServices);

    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('What was this expense for?'),
      expect.anything()
    );

    const draft = expenseStateManager.getState(-1001234, 456);
    expect(draft).not.toBeNull();
    expect(draft?.step).toBe('AWAITING_DESCRIPTION');
    expect(draft?.creatorUserId).toBe('db-u1');
    expect(draft?.groupId).toBe('db-g1');
  });

  it('advances from AWAITING_DESCRIPTION to AWAITING_AMOUNT on valid text input', async () => {
    expenseStateManager.setState({
      chatId: -1001234,
      userId: 456,
      groupId: 'db-g1',
      creatorUserId: 'db-u1',
      step: 'AWAITING_DESCRIPTION',
      participantUserIds: [],
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const replyMock = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      chat: { id: -1001234, type: 'group' },
      from: { id: 456, first_name: 'Bob' },
      message: { text: 'Dinner at Pizzeria' },
      reply: replyMock,
    } as unknown as Context;

    const handled = await handleExpenseTextInput(mockCtx, {} as BotServices);

    expect(handled).toBe(true);
    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('How much was it?'),
      expect.anything()
    );

    const draft = expenseStateManager.getState(-1001234, 456);
    expect(draft?.description).toBe('Dinner at Pizzeria');
    expect(draft?.step).toBe('AWAITING_AMOUNT');
  });

  it('rejects invalid amount and keeps user in AWAITING_AMOUNT step', async () => {
    expenseStateManager.setState({
      chatId: -1001234,
      userId: 456,
      groupId: 'db-g1',
      creatorUserId: 'db-u1',
      description: 'Dinner at Pizzeria',
      step: 'AWAITING_AMOUNT',
      participantUserIds: [],
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const replyMock = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      chat: { id: -1001234, type: 'group' },
      from: { id: 456, first_name: 'Bob' },
      message: { text: 'not-a-number' },
      reply: replyMock,
    } as unknown as Context;

    const handled = await handleExpenseTextInput(mockCtx, {} as BotServices);

    expect(handled).toBe(true);
    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('Please enter a valid positive amount'),
      expect.anything()
    );

    const draft = expenseStateManager.getState(-1001234, 456);
    expect(draft?.step).toBe('AWAITING_AMOUNT');
    expect(draft?.totalAmount).toBeUndefined();
  });

  it('advances from AWAITING_AMOUNT to AWAITING_PAYER on valid amount input', async () => {
    expenseStateManager.setState({
      chatId: -1001234,
      userId: 456,
      groupId: 'db-g1',
      creatorUserId: 'db-u1',
      description: 'Dinner at Pizzeria',
      step: 'AWAITING_AMOUNT',
      participantUserIds: [],
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const mockServices = {
      groupService: {
        getActiveMembers: vi.fn().mockResolvedValue([
          { userId: 'db-u1', displayName: 'Bob' },
          { userId: 'db-u2', displayName: 'Alice' },
        ]),
      },
      userService: {
        getUserById: vi.fn().mockResolvedValue({ id: 'db-u1', firstName: 'Bob' }),
      },
    } as unknown as BotServices;

    const replyMock = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      chat: { id: -1001234, type: 'group' },
      from: { id: 456, first_name: 'Bob' },
      message: { text: '2400.50' }, // ₹2400.50 = 240050 paise
      reply: replyMock,
    } as unknown as Context;

    const handled = await handleExpenseTextInput(mockCtx, mockServices);

    expect(handled).toBe(true);
    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('Who paid ₹2400.50?'),
      expect.anything()
    );

    const draft = expenseStateManager.getState(-1001234, 456);
    expect(draft?.totalAmount).toBe(240050);
    expect(draft?.step).toBe('AWAITING_PAYER');
  });

  it('clears state on /cancel message', async () => {
    expenseStateManager.setState({
      chatId: -1001234,
      userId: 456,
      groupId: 'db-g1',
      creatorUserId: 'db-u1',
      step: 'AWAITING_DESCRIPTION',
      participantUserIds: [],
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const mockCtx = {
      chat: { id: -1001234, type: 'group' },
      from: { id: 456 },
      message: { text: '/cancel' },
    } as unknown as Context;

    const handled = await handleExpenseTextInput(mockCtx, {} as BotServices);

    expect(handled).toBe(false); // Let cancel command run
    expect(expenseStateManager.getState(-1001234, 456)).toBeNull();
  });
});
