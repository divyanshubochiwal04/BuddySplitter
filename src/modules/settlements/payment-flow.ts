import { Context } from 'grammy';
import { BotServices } from '../services';
import { formatPaise, toPaise } from '../../shared/currency';
import { escapeMarkdown } from '../../shared/markdown';
import { logger } from '../../shared/logger';
import { paymentStateManager } from './payment-state';
import {
  buildCancelPaymentKeyboard,
  buildGroupSettlementKeyboard,
  buildPaymentAmountChoiceKeyboard,
  buildPaymentConfirmationKeyboard,
  buildPaymentRecipientsKeyboard,
  buildPaymentSuccessKeyboard,
} from '../../bot/keyboards/settlement.keyboard';

/**
 * Initiates the payment recording wizard for the invoking user in a group.
 */
export async function startPaymentSelection(
  ctx: Context,
  services: BotServices
): Promise<void> {
  const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

  if (!isGroup || !ctx.chat || !ctx.from) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({
        text: '⚠️ Payment recording is available inside a group.',
        show_alert: true,
      });
    } else {
      await ctx.reply('⚠️ Payment recording is available inside a group.');
    }
    return;
  }

  try {
    const { userSummary, groupPlan } =
      await services.settlementService.getUserSettlementSummaryForTelegram(
        ctx.chat.id,
        ctx.from.id
      );

    if (userSummary.payments.length === 0) {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({
          text: '🎉 You do not have any outstanding payments to make!',
          show_alert: true,
        });
      } else {
        await ctx.reply('🎉 You do not have any outstanding payments to make!');
      }
      return;
    }

    // Set initial payment state
    paymentStateManager.setState({
      chatId: ctx.chat.id,
      userId: ctx.from.id,
      groupId: groupPlan.groupId,
      payerUserId: userSummary.userId,
      payerDisplayName: userSummary.displayName,
      step: 'AWAITING_RECIPIENT',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const message =
      `💸 *Record a Payment*\n\n` +
      `Select who you paid:`;
    const keyboard = buildPaymentRecipientsKeyboard(userSummary.payments);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
      await ctx.answerCallbackQuery();
    } else {
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    }
  } catch (error: any) {
    logger.error('Failed to initiate payment flow:', error);
    const msg = `⚠️ ${error.message || 'Unable to record payment at this time.'}`;
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: msg, show_alert: true });
    } else {
      await ctx.reply(msg);
    }
  }
}

/**
 * Handles recipient selection button callback.
 */
export async function handleSelectRecipient(
  ctx: Context,
  services: BotServices,
  recipientUserId: string
): Promise<void> {
  if (!ctx.chat || !ctx.from) return;

  const draft = paymentStateManager.getState(ctx.chat.id, ctx.from.id);
  if (!draft || draft.userId !== ctx.from.id) {
    await ctx.answerCallbackQuery({
      text: '⚠️ Payment session expired. Please start over from /settle.',
      show_alert: true,
    });
    return;
  }

  try {
    const { userSummary } =
      await services.settlementService.getUserSettlementSummaryForTelegram(
        ctx.chat.id,
        ctx.from.id
      );

    const tx = userSummary.payments.find((p) => p.toUserId === recipientUserId);
    if (!tx) {
      await ctx.answerCallbackQuery({
        text: '⚠️ Outstanding balance with this member not found or already settled.',
        show_alert: true,
      });
      paymentStateManager.clearState(ctx.chat.id, ctx.from.id);
      return;
    }

    paymentStateManager.updateState(ctx.chat.id, ctx.from.id, {
      recipientUserId: tx.toUserId,
      recipientDisplayName: tx.toDisplayName,
      maxAmount: tx.amount,
      step: 'AWAITING_AMOUNT_CHOICE',
    });

    const message =
      `💸 *Payment to ${tx.toDisplayName}*\n\n` +
      `Current amount owed: *${formatPaise(tx.amount)}*\n\n` +
      `How much would you like to record?`;
    const keyboard = buildPaymentAmountChoiceKeyboard(tx.amount);

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
    await ctx.answerCallbackQuery();
  } catch (error: any) {
    logger.error('Error selecting payment recipient:', error);
    await ctx.answerCallbackQuery({
      text: `⚠️ ${error.message || 'Error selecting recipient.'}`,
      show_alert: true,
    });
  }
}

/**
 * Handles full amount choice button.
 */
export async function handleChooseFullAmount(ctx: Context): Promise<void> {
  if (!ctx.chat || !ctx.from) return;

  const draft = paymentStateManager.getState(ctx.chat.id, ctx.from.id);
  if (!draft || draft.userId !== ctx.from.id || !draft.maxAmount) {
    await ctx.answerCallbackQuery({
      text: '⚠️ Payment session expired. Please start over.',
      show_alert: true,
    });
    return;
  }

  paymentStateManager.updateState(ctx.chat.id, ctx.from.id, {
    amount: draft.maxAmount,
    step: 'AWAITING_CONFIRMATION',
  });

  const message =
    `💸 *Confirm Payment*\n\n` +
    `• *To:* ${escapeMarkdown(draft.recipientDisplayName)}\n` +
    `• *Amount:* ${formatPaise(draft.maxAmount)}\n\n` +
    `Are you sure you want to record this payment?`;
  const keyboard = buildPaymentConfirmationKeyboard();

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
  await ctx.answerCallbackQuery();
}

/**
 * Handles custom amount choice button.
 */
export async function handleChooseCustomAmount(ctx: Context): Promise<void> {
  if (!ctx.chat || !ctx.from) return;

  const draft = paymentStateManager.getState(ctx.chat.id, ctx.from.id);
  if (!draft || draft.userId !== ctx.from.id || !draft.maxAmount) {
    await ctx.answerCallbackQuery({
      text: '⚠️ Payment session expired. Please start over.',
      show_alert: true,
    });
    return;
  }

  paymentStateManager.updateState(ctx.chat.id, ctx.from.id, {
    step: 'AWAITING_CUSTOM_AMOUNT',
  });

  const message =
    `💸 *Enter Payment Amount*\n\n` +
    `How much did you pay *${escapeMarkdown(draft.recipientDisplayName)}* in ₹?\n` +
    `Maximum allowed: *${formatPaise(draft.maxAmount)}*\n\n` +
    `_Reply with the amount (e.g. 250 or 250.50)_`;
  const keyboard = buildCancelPaymentKeyboard();

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
  await ctx.answerCallbackQuery();
}

/**
 * Handles text input when user replies with custom payment amount.
 * Returns true if the message was handled by the payment wizard.
 */
export async function handlePaymentTextInput(
  ctx: Context,
  _services: BotServices
): Promise<boolean> {
  if (!ctx.chat || !ctx.from || !ctx.message?.text) return false;

  if (!paymentStateManager.isUserRecordingPayment(ctx.chat.id, ctx.from.id)) {
    return false;
  }

  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return false;

  const draft = paymentStateManager.getState(ctx.chat.id, ctx.from.id);
  if (!draft || !draft.maxAmount) return false;

  let amountPaise: number;
  try {
    amountPaise = toPaise(text);
  } catch {
    await ctx.reply('⚠️ Please enter a valid positive amount in ₹ (e.g. 250 or 250.50).');
    return true;
  }

  if (amountPaise <= 0) {
    await ctx.reply('⚠️ Amount must be greater than 0.');
    return true;
  }

  if (amountPaise > draft.maxAmount) {
    await ctx.reply(
      `❌ Payment exceeds the current amount owed. Maximum allowed: ${formatPaise(draft.maxAmount)}`
    );
    return true;
  }

  paymentStateManager.updateState(ctx.chat.id, ctx.from.id, {
    amount: amountPaise,
    step: 'AWAITING_CONFIRMATION',
  });

  const message =
    `💸 *Confirm Payment*\n\n` +
    `• *To:* ${escapeMarkdown(draft.recipientDisplayName)}\n` +
    `• *Amount:* ${formatPaise(amountPaise)}\n\n` +
    `Are you sure you want to record this payment?`;
  const keyboard = buildPaymentConfirmationKeyboard();

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });

  return true;
}

/**
 * Handles final payment confirmation button callback.
 * Protected with idempotency guard (SAVING state).
 */
export async function handleConfirmPayment(
  ctx: Context,
  services: BotServices
): Promise<void> {
  if (!ctx.chat || !ctx.from) return;

  const draft = paymentStateManager.getState(ctx.chat.id, ctx.from.id);
  if (!draft || draft.userId !== ctx.from.id) {
    await ctx.answerCallbackQuery({
      text: '⚠️ Payment session expired or invalid. Please start over from /settle.',
      show_alert: true,
    });
    return;
  }

  if (draft.step === 'SAVING') {
    // Idempotency lock against double taps
    await ctx.answerCallbackQuery({
      text: '⏳ Payment is currently being recorded...',
    });
    return;
  }

  if (!draft.recipientUserId || !draft.amount) {
    await ctx.answerCallbackQuery({
      text: '⚠️ Incomplete payment information. Please start over.',
      show_alert: true,
    });
    return;
  }

  // Lock state
  draft.step = 'SAVING';

  try {
    const result = await services.settlementService.recordPaymentForTelegram({
      telegramChatId: ctx.chat.id,
      telegramUserId: ctx.from.id,
      toUserId: draft.recipientUserId,
      amount: draft.amount,
    });

    // Clear state
    paymentStateManager.clearState(ctx.chat.id, ctx.from.id);

    const message =
      `✅ *Payment Recorded!*\n\n` +
      `• *Payer:* ${escapeMarkdown(result.fromDisplayName)}\n` +
      `• *Recipient:* ${escapeMarkdown(result.toDisplayName)}\n` +
      `• *Amount:* ${formatPaise(result.settlement.amount)}\n\n` +
      `Group balances and settlements have been updated.`;
    const keyboard = buildPaymentSuccessKeyboard();

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
    await ctx.answerCallbackQuery();
  } catch (error: any) {
    logger.error('Failed to confirm and record payment:', error);
    draft.step = 'AWAITING_CONFIRMATION'; // Reset lock on error
    await ctx.answerCallbackQuery({
      text: `⚠️ ${error.message || 'Failed to record payment.'}`,
      show_alert: true,
    });
  }
}

/**
 * Handles cancelling the payment wizard.
 */
export async function handleCancelPayment(ctx: Context): Promise<void> {
  if (ctx.chat && ctx.from) {
    paymentStateManager.clearState(ctx.chat.id, ctx.from.id);
  }

  if (ctx.callbackQuery) {
    await ctx.editMessageText('❌ Payment recording cancelled.', {
      reply_markup: buildGroupSettlementKeyboard(),
    });
    await ctx.answerCallbackQuery();
  } else {
    await ctx.reply('❌ Payment recording cancelled.');
  }
}
