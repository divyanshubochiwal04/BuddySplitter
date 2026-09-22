import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRepayCallback } from './repay-callbacks';
import { BotServices } from '../../modules/services';
import { paymentStateManager } from '../../modules/settlements/payment-state';
import { Context } from 'grammy';

describe('Repay Callbacks', () => {
  const chatId = -1001234;
  const userId = 888;

  const mockDebts = [
    { toUserId: 'u1', toDisplayName: 'Alice', debtAmount: 30000 },
    { toUserId: 'u2', toDisplayName: 'Bob', debtAmount: 50000 },
  ];

  const mockServices = {
    settlementService: {
      recordPaymentForTelegram: vi.fn().mockResolvedValue({
        settlement: { id: 's1' },
        fromDisplayName: 'Payer',
        toDisplayName: 'Alice',
      }),
    },
  } as unknown as BotServices;

  function seedRepayDraft(overrides: any = {}) {
    paymentStateManager.setState({
      chatId,
      userId,
      groupId: 'g1',
      payerUserId: 'u-payer',
      payerDisplayName: 'Payer',
      step: 'AWAITING_REPAY_SELECTION',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      repayTargetAmount: 45000, // ₹450
      repayDebts: mockDebts,
      selectedRecipientIds: ['u1', 'u2'],
      ...overrides,
    });
  }

  beforeEach(() => {
    paymentStateManager.clearAll();
    vi.clearAllMocks();
  });

  it('ignores callbacks not starting with rpy:', async () => {
    const ctx = {} as Context;
    const handled = await handleRepayCallback(ctx, 'pay:confirm', mockServices);
    expect(handled).toBe(false);
  });

  it('answers alert if session is expired', async () => {
    const answerCallbackQuery = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      chat: { id: chatId },
      from: { id: userId },
      answerCallbackQuery,
    } as unknown as Context;

    const handled = await handleRepayCallback(ctx, 'rpy:tog:u1', mockServices);
    expect(handled).toBe(true);
    expect(answerCallbackQuery).toHaveBeenCalledWith(
      expect.objectContaining({ show_alert: true })
    );
  });

  it('handles rpy:tog:<userId> to toggle a debt off and on', async () => {
    seedRepayDraft({ selectedRecipientIds: ['u1', 'u2'] });
    const editMessageText = vi.fn().mockResolvedValue(undefined);
    const answerCallbackQuery = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      chat: { id: chatId },
      from: { id: userId },
      editMessageText,
      answerCallbackQuery,
    } as unknown as Context;

    // Toggle Bob off
    await handleRepayCallback(ctx, 'rpy:tog:u2', mockServices);

    const draft = paymentStateManager.getState(chatId, userId);
    expect(draft?.selectedRecipientIds).toEqual(['u1']);
    expect(editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('Alice'),
      expect.anything()
    );
  });

  it('handles rpy:confirm and records all active allocations', async () => {
    seedRepayDraft({
      repayTargetAmount: 45000,
      selectedRecipientIds: ['u1', 'u2'],
    });

    const editMessageText = vi.fn().mockResolvedValue(undefined);
    const answerCallbackQuery = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      chat: { id: chatId },
      from: { id: userId },
      editMessageText,
      answerCallbackQuery,
    } as unknown as Context;

    await handleRepayCallback(ctx, 'rpy:confirm', mockServices);

    // Alice gets ₹300, Bob gets ₹150
    expect(mockServices.settlementService.recordPaymentForTelegram).toHaveBeenCalledTimes(2);
    expect(mockServices.settlementService.recordPaymentForTelegram).toHaveBeenCalledWith(
      expect.objectContaining({
        toUserId: 'u1',
        amount: 30000,
      })
    );
    expect(mockServices.settlementService.recordPaymentForTelegram).toHaveBeenCalledWith(
      expect.objectContaining({
        toUserId: 'u2',
        amount: 15000,
      })
    );

    expect(editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('Repayment Successful!'),
      expect.anything()
    );
    expect(paymentStateManager.getState(chatId, userId)).toBeNull();
  });

  it('handles rpy:cancel', async () => {
    seedRepayDraft();
    const editMessageText = vi.fn().mockResolvedValue(undefined);
    const answerCallbackQuery = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      chat: { id: chatId },
      from: { id: userId },
      editMessageText,
      answerCallbackQuery,
    } as unknown as Context;

    await handleRepayCallback(ctx, 'rpy:cancel', mockServices);

    expect(editMessageText).toHaveBeenCalledWith('❌ Repayment cancelled.');
    expect(paymentStateManager.getState(chatId, userId)).toBeNull();
  });
});
