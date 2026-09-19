import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Context } from 'grammy';
import {
  handleCancelPayment,
  handleChooseCustomAmount,
  handleChooseFullAmount,
  handleConfirmPayment,
  handlePaymentTextInput,
  handleSelectRecipient,
  startPaymentSelection,
} from './payment-flow';
import { paymentStateManager } from './payment-state';
import { BotServices } from '../services';

describe('Payment Flow Wizard', () => {
  beforeEach(() => {
    paymentStateManager.clearAll();
  });

  function createMockContext(options?: {
    chatType?: 'group' | 'private';
    chatId?: number;
    userId?: number;
    text?: string;
    isCallback?: boolean;
  }) {
    const chatType = options?.chatType ?? 'group';
    const chatId = options?.chatId ?? -100123;
    const userId = options?.userId ?? 111;

    return {
      chat: { id: chatId, type: chatType },
      from: { id: userId, first_name: 'Bob' },
      message: options?.text !== undefined ? { text: options.text } : undefined,
      callbackQuery: options?.isCallback ? { id: 'cb-1', data: 'data' } : undefined,
      reply: vi.fn(),
      editMessageText: vi.fn(),
      answerCallbackQuery: vi.fn(),
    } as unknown as Context;
  }

  it('rejects initiation in private chat', async () => {
    const ctx = createMockContext({ chatType: 'private' });
    const services = {} as BotServices;

    await startPaymentSelection(ctx, services);

    expect(ctx.reply).toHaveBeenCalledWith('⚠️ Payment recording is available inside a group.');
  });

  it('informs user if they have no debts to pay', async () => {
    const ctx = createMockContext();
    const services = {
      settlementService: {
        getUserSettlementSummaryForTelegram: vi.fn().mockResolvedValue({
          userSummary: { userId: 'u-bob', displayName: 'Bob', payments: [] },
          groupPlan: { groupId: 'grp-1', transactions: [] },
        }),
      },
    } as unknown as BotServices;

    await startPaymentSelection(ctx, services);

    expect(ctx.reply).toHaveBeenCalledWith('🎉 You do not have any outstanding payments to make!');
  });

  it('starts payment selection and shows recipients when debts exist', async () => {
    const ctx = createMockContext();
    const services = {
      settlementService: {
        getUserSettlementSummaryForTelegram: vi.fn().mockResolvedValue({
          userSummary: {
            userId: 'u-bob',
            displayName: 'Bob',
            payments: [
              {
                fromUserId: 'u-bob',
                fromDisplayName: 'Bob',
                toUserId: 'u-alice',
                toDisplayName: 'Alice',
                amount: 50000,
              },
            ],
          },
          groupPlan: { groupId: 'grp-1', transactions: [] },
        }),
      },
    } as unknown as BotServices;

    await startPaymentSelection(ctx, services);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Record a Payment'),
      expect.objectContaining({ reply_markup: expect.anything() })
    );

    const draft = paymentStateManager.getState(-100123, 111);
    expect(draft?.step).toBe('AWAITING_RECIPIENT');
    expect(draft?.payerUserId).toBe('u-bob');
  });

  it('handles recipient selection and presents amount choice', async () => {
    paymentStateManager.setState({
      chatId: -100123,
      userId: 111,
      groupId: 'grp-1',
      payerUserId: 'u-bob',
      payerDisplayName: 'Bob',
      step: 'AWAITING_RECIPIENT',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const ctx = createMockContext({ isCallback: true });
    const services = {
      settlementService: {
        getUserSettlementSummaryForTelegram: vi.fn().mockResolvedValue({
          userSummary: {
            payments: [
              {
                fromUserId: 'u-bob',
                fromDisplayName: 'Bob',
                toUserId: 'u-alice',
                toDisplayName: 'Alice',
                amount: 50000,
              },
            ],
          },
        }),
      },
    } as unknown as BotServices;

    await handleSelectRecipient(ctx, services, 'u-alice');

    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('Payment to Alice'),
      expect.anything()
    );

    const draft = paymentStateManager.getState(-100123, 111);
    expect(draft?.step).toBe('AWAITING_AMOUNT_CHOICE');
    expect(draft?.recipientUserId).toBe('u-alice');
    expect(draft?.maxAmount).toBe(50000);
  });

  it('handles full amount selection', async () => {
    paymentStateManager.setState({
      chatId: -100123,
      userId: 111,
      groupId: 'grp-1',
      payerUserId: 'u-bob',
      payerDisplayName: 'Bob',
      recipientUserId: 'u-alice',
      recipientDisplayName: 'Alice',
      maxAmount: 50000,
      step: 'AWAITING_AMOUNT_CHOICE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const ctx = createMockContext({ isCallback: true });
    await handleChooseFullAmount(ctx);

    const draft = paymentStateManager.getState(-100123, 111);
    expect(draft?.step).toBe('AWAITING_CONFIRMATION');
    expect(draft?.amount).toBe(50000);

    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('Confirm Payment'),
      expect.anything()
    );
  });

  it('handles custom amount choice and prompt', async () => {
    paymentStateManager.setState({
      chatId: -100123,
      userId: 111,
      groupId: 'grp-1',
      payerUserId: 'u-bob',
      payerDisplayName: 'Bob',
      recipientUserId: 'u-alice',
      recipientDisplayName: 'Alice',
      maxAmount: 50000,
      step: 'AWAITING_AMOUNT_CHOICE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const ctx = createMockContext({ isCallback: true });
    await handleChooseCustomAmount(ctx);

    const draft = paymentStateManager.getState(-100123, 111);
    expect(draft?.step).toBe('AWAITING_CUSTOM_AMOUNT');

    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('Enter Payment Amount'),
      expect.anything()
    );
  });

  it('validates custom amount text input and rejects overpayments', async () => {
    paymentStateManager.setState({
      chatId: -100123,
      userId: 111,
      groupId: 'grp-1',
      payerUserId: 'u-bob',
      payerDisplayName: 'Bob',
      recipientUserId: 'u-alice',
      recipientDisplayName: 'Alice',
      maxAmount: 50000, // max ₹500
      step: 'AWAITING_CUSTOM_AMOUNT',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const services = {} as BotServices;

    // 1. Overpayment: user types 600 (₹600 > ₹500)
    const overCtx = createMockContext({ text: '600' });
    const overHandled = await handlePaymentTextInput(overCtx, services);
    expect(overHandled).toBe(true);
    expect(overCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('❌ Payment exceeds the current amount owed.')
    );

    // 2. Valid partial amount: user types 250 (₹250 <= ₹500)
    const validCtx = createMockContext({ text: '250' });
    const validHandled = await handlePaymentTextInput(validCtx, services);
    expect(validHandled).toBe(true);
    expect(validCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Confirm Payment'),
      expect.anything()
    );

    const draft = paymentStateManager.getState(-100123, 111);
    expect(draft?.step).toBe('AWAITING_CONFIRMATION');
    expect(draft?.amount).toBe(25000);
  });

  it('confirms payment, persists to repository, and clears draft with idempotency', async () => {
    paymentStateManager.setState({
      chatId: -100123,
      userId: 111,
      groupId: 'grp-1',
      payerUserId: 'u-bob',
      payerDisplayName: 'Bob',
      recipientUserId: 'u-alice',
      recipientDisplayName: 'Alice',
      amount: 25000,
      step: 'AWAITING_CONFIRMATION',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const ctx = createMockContext({ isCallback: true });
    const services = {
      settlementService: {
        recordPaymentForTelegram: vi.fn().mockResolvedValue({
          settlement: { id: 'set-1', amount: 25000 },
          fromDisplayName: 'Bob',
          toDisplayName: 'Alice',
        }),
      },
    } as unknown as BotServices;

    await handleConfirmPayment(ctx, services);

    expect(services.settlementService.recordPaymentForTelegram).toHaveBeenCalledWith({
      telegramChatId: -100123,
      telegramUserId: 111,
      toUserId: 'u-alice',
      amount: 25000,
    });

    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('Payment Recorded!'),
      expect.anything()
    );

    // State cleared
    expect(paymentStateManager.getState(-100123, 111)).toBeNull();
  });

  it('cancels payment and clears draft', async () => {
    paymentStateManager.setState({
      chatId: -100123,
      userId: 111,
      groupId: 'grp-1',
      payerUserId: 'u-bob',
      payerDisplayName: 'Bob',
      step: 'AWAITING_RECIPIENT',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const ctx = createMockContext({ isCallback: true });
    await handleCancelPayment(ctx);

    expect(paymentStateManager.getState(-100123, 111)).toBeNull();
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('Payment recording cancelled.'),
      expect.anything()
    );
  });
});
