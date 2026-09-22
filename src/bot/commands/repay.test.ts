import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRepayCommandHandler } from './repay';
import { BotServices } from '../../modules/services';
import { paymentStateManager } from '../../modules/settlements/payment-state';
import { Context } from 'grammy';

describe('/repay command handler', () => {
  const chatId = -1001234;
  const userId = 555;

  const mockDebts = [
    {
      fromUserId: 'db-u-payer',
      fromDisplayName: 'Payer',
      toUserId: 'db-u-alice',
      toDisplayName: 'Alice',
      amount: 30000, // ₹300
    },
    {
      fromUserId: 'db-u-payer',
      fromDisplayName: 'Payer',
      toUserId: 'db-u-bob',
      toDisplayName: 'Bob',
      amount: 50000, // ₹500
    },
  ];

  const mockServices = {
    settlementService: {
      getUserSettlementSummaryForTelegram: vi.fn().mockResolvedValue({
        userSummary: {
          userId: 'db-u-payer',
          displayName: 'Payer',
          payments: mockDebts,
          receivables: [],
          totalToPay: 80000,
          totalToReceive: 0,
          netBalance: -80000,
          isSettled: false,
        },
        groupPlan: {
          groupId: 'db-g1',
          transactions: mockDebts,
        },
      }),
      recordPaymentForTelegram: vi.fn().mockResolvedValue({
        settlement: { id: 's1', amount: 30000 },
        fromDisplayName: 'Payer',
        toDisplayName: 'Alice',
      }),
    },
  } as unknown as BotServices;

  beforeEach(() => {
    paymentStateManager.clearAll();
    vi.clearAllMocks();
  });

  it('rejects /repay in private chat', async () => {
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      chat: { id: 123, type: 'private' },
      from: { id: userId },
      reply: replyMock,
    } as unknown as Context;

    const handler = createRepayCommandHandler(mockServices);
    await handler(ctx);

    expect(replyMock).toHaveBeenCalledWith('⚠️ Repayments can only be made inside a group.');
  });

  it('notifies user when no outstanding debts exist', async () => {
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      chat: { id: chatId, type: 'group' },
      from: { id: userId },
      message: { text: '/repay 450' },
      reply: replyMock,
    } as unknown as Context;

    const noDebtServices = {
      settlementService: {
        getUserSettlementSummaryForTelegram: vi.fn().mockResolvedValue({
          userSummary: { payments: [] },
          groupPlan: { groupId: 'db-g1' },
        }),
      },
    } as unknown as BotServices;

    const handler = createRepayCommandHandler(noDebtServices);
    await handler(ctx);

    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('do not have any outstanding debts')
    );
  });

  it('handles /repay with no amount: shows debts list with quick pay buttons', async () => {
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      chat: { id: chatId, type: 'group' },
      from: { id: userId },
      message: { text: '/repay' },
      reply: replyMock,
    } as unknown as Context;

    const handler = createRepayCommandHandler(mockServices);
    await handler(ctx);

    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('Repay Debts'),
      expect.objectContaining({
        parse_mode: 'Markdown',
        reply_markup: expect.anything(),
      })
    );

    const draft = paymentStateManager.getState(chatId, userId);
    expect(draft).not.toBeNull();
    expect(draft?.step).toBe('AWAITING_REPAY_SELECTION');
    expect(draft?.repayDebts).toHaveLength(2);
  });

  it('handles /repay 450: auto-selects debts and calculates partial remaining debt', async () => {
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      chat: { id: chatId, type: 'group' },
      from: { id: userId },
      message: { text: '/repay 450' },
      reply: replyMock,
    } as unknown as Context;

    const handler = createRepayCommandHandler(mockServices);
    await handler(ctx);

    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('Repay ₹450.00'),
      expect.objectContaining({
        parse_mode: 'Markdown',
        reply_markup: expect.anything(),
      })
    );

    const draft = paymentStateManager.getState(chatId, userId);
    expect(draft).not.toBeNull();
    expect(draft?.repayTargetAmount).toBe(45000);
    // Auto-selects Alice (₹300) and Bob (₹150 remaining towards ₹500)
    expect(draft?.selectedRecipientIds).toEqual(['db-u-alice', 'db-u-bob']);
  });

  it('rejects invalid amount like /repay abc', async () => {
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      chat: { id: chatId, type: 'group' },
      from: { id: userId },
      message: { text: '/repay abc' },
      reply: replyMock,
    } as unknown as Context;

    const handler = createRepayCommandHandler(mockServices);
    await handler(ctx);

    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('valid positive amount'),
      expect.anything()
    );
  });
});
