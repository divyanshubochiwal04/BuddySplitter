import { Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { paymentStateManager } from '../../modules/settlements/payment-state';
import {
  autoSelectDebtsForAmount,
  calculateRepayAllocations,
} from '../../modules/settlements/repay-calculator';
import {
  formatRepaySelectionMessage,
  formatRepaySuccessMessage,
} from '../messages/repay';
import {
  buildRepaySelectionKeyboard,
  buildRepaySuccessKeyboard,
} from '../keyboards/repay.keyboard';
import { logger } from '../../shared/logger';

/**
 * Handles callback queries starting with 'rpy:'
 */
export async function handleRepayCallback(
  ctx: Context,
  data: string,
  services: BotServices
): Promise<boolean> {
  if (!data.startsWith('rpy:')) {
    return false;
  }

  if (!ctx.chat || !ctx.from) return false;

  const draft = paymentStateManager.getState(ctx.chat.id, ctx.from.id);
  if (!draft || draft.userId !== ctx.from.id || !draft.repayDebts) {
    await ctx.answerCallbackQuery({
      text: '⚠️ Repayment session expired. Please run /repay again.',
      show_alert: true,
    });
    return true;
  }

  // Helper to safely edit message without failing if text hasn't changed
  const safeEdit = async (text: string, keyboard: any) => {
    try {
      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (err: any) {
      if (!err?.message?.includes('message is not modified')) {
        throw err;
      }
    }
  };

  // 1. Cancel
  if (data === 'rpy:cancel') {
    paymentStateManager.clearState(ctx.chat.id, ctx.from.id);
    try {
      await ctx.editMessageText('❌ Repayment cancelled.');
    } catch {
      // Ignore if edit fails
    }
    await ctx.answerCallbackQuery();
    return true;
  }

  // 2. Pay single debt in full (from no-amount menu)
  if (data.startsWith('rpy:payone:')) {
    const targetUserId = data.slice('rpy:payone:'.length);
    const debt = draft.repayDebts.find((d) => d.toUserId === targetUserId);
    if (!debt) {
      await ctx.answerCallbackQuery({ text: '⚠️ Debt not found.', show_alert: true });
      return true;
    }

    draft.repayTargetAmount = debt.debtAmount;
    draft.selectedRecipientIds = [debt.toUserId];
    paymentStateManager.updateState(ctx.chat.id, ctx.from.id, {
      repayTargetAmount: debt.debtAmount,
      selectedRecipientIds: [debt.toUserId],
    });

    const calcResult = calculateRepayAllocations(
      debt.debtAmount,
      draft.repayDebts,
      [debt.toUserId]
    );
    const message = formatRepaySelectionMessage(debt.debtAmount, draft.repayDebts, calcResult);
    const keyboard = buildRepaySelectionKeyboard(draft.repayDebts, [debt.toUserId], calcResult);

    await safeEdit(message, keyboard);
    await ctx.answerCallbackQuery();
    return true;
  }

  // 3. Pay all debts in full (from no-amount menu)
  if (data === 'rpy:payall') {
    const total = draft.repayDebts.reduce((sum, d) => sum + d.debtAmount, 0);
    const allIds = draft.repayDebts.map((d) => d.toUserId);
    draft.repayTargetAmount = total;
    draft.selectedRecipientIds = allIds;
    paymentStateManager.updateState(ctx.chat.id, ctx.from.id, {
      repayTargetAmount: total,
      selectedRecipientIds: allIds,
    });

    const calcResult = calculateRepayAllocations(total, draft.repayDebts, allIds);
    const message = formatRepaySelectionMessage(total, draft.repayDebts, calcResult);
    const keyboard = buildRepaySelectionKeyboard(draft.repayDebts, allIds, calcResult);

    await safeEdit(message, keyboard);
    await ctx.answerCallbackQuery();
    return true;
  }

  // 4. Toggle single debt checkbox
  if (data.startsWith('rpy:tog:')) {
    const targetUserId = data.slice('rpy:tog:'.length);
    const currentSelected = new Set(draft.selectedRecipientIds || []);

    if (currentSelected.has(targetUserId)) {
      currentSelected.delete(targetUserId);
    } else {
      currentSelected.add(targetUserId);
    }

    const updated = Array.from(currentSelected);
    draft.selectedRecipientIds = updated;
    paymentStateManager.updateState(ctx.chat.id, ctx.from.id, {
      selectedRecipientIds: updated,
    });

    const targetAmount = draft.repayTargetAmount || 0;
    const calcResult = calculateRepayAllocations(targetAmount, draft.repayDebts, updated);
    const message = formatRepaySelectionMessage(targetAmount, draft.repayDebts, calcResult);
    const keyboard = buildRepaySelectionKeyboard(draft.repayDebts, updated, calcResult);

    await safeEdit(message, keyboard);
    await ctx.answerCallbackQuery();
    return true;
  }

  // 5. Auto-fill button
  if (data === 'rpy:autofill') {
    const targetAmount = draft.repayTargetAmount || 0;
    const autofillIds = autoSelectDebtsForAmount(targetAmount, draft.repayDebts);
    draft.selectedRecipientIds = autofillIds;
    paymentStateManager.updateState(ctx.chat.id, ctx.from.id, {
      selectedRecipientIds: autofillIds,
    });

    const calcResult = calculateRepayAllocations(targetAmount, draft.repayDebts, autofillIds);
    const message = formatRepaySelectionMessage(targetAmount, draft.repayDebts, calcResult);
    const keyboard = buildRepaySelectionKeyboard(draft.repayDebts, autofillIds, calcResult);

    await safeEdit(message, keyboard);
    await ctx.answerCallbackQuery();
    return true;
  }

  // 6. Select All
  if (data === 'rpy:all') {
    const targetAmount = draft.repayTargetAmount || 0;
    const allIds = draft.repayDebts.map((d) => d.toUserId);
    draft.selectedRecipientIds = allIds;
    paymentStateManager.updateState(ctx.chat.id, ctx.from.id, {
      selectedRecipientIds: allIds,
    });

    const calcResult = calculateRepayAllocations(targetAmount, draft.repayDebts, allIds);
    const message = formatRepaySelectionMessage(targetAmount, draft.repayDebts, calcResult);
    const keyboard = buildRepaySelectionKeyboard(draft.repayDebts, allIds, calcResult);

    await safeEdit(message, keyboard);
    await ctx.answerCallbackQuery();
    return true;
  }

  // 7. Clear All
  if (data === 'rpy:clear') {
    const targetAmount = draft.repayTargetAmount || 0;
    draft.selectedRecipientIds = [];
    paymentStateManager.updateState(ctx.chat.id, ctx.from.id, {
      selectedRecipientIds: [],
    });

    const calcResult = calculateRepayAllocations(targetAmount, draft.repayDebts, []);
    const message = formatRepaySelectionMessage(targetAmount, draft.repayDebts, calcResult);
    const keyboard = buildRepaySelectionKeyboard(draft.repayDebts, [], calcResult);

    await safeEdit(message, keyboard);
    await ctx.answerCallbackQuery();
    return true;
  }

  // 8. Confirm Repayment Execution
  if (data === 'rpy:confirm') {
    if (draft.step === 'SAVING') {
      await ctx.answerCallbackQuery({ text: '⏳ Repayment is currently being recorded...' });
      return true;
    }

    const targetAmount = draft.repayTargetAmount || 0;
    const calcResult = calculateRepayAllocations(
      targetAmount,
      draft.repayDebts,
      draft.selectedRecipientIds || []
    );

    const activeAllocations = calcResult.allocations.filter((a) => a.allocatedAmount > 0);
    if (activeAllocations.length === 0) {
      await ctx.answerCallbackQuery({
        text: '⚠️ Please select at least one debt to allocate your payment.',
        show_alert: true,
      });
      return true;
    }

    draft.step = 'SAVING';
    await ctx.answerCallbackQuery({ text: 'Recording repayment...' });

    try {
      for (const alloc of activeAllocations) {
        await services.settlementService.recordPaymentForTelegram({
          telegramChatId: ctx.chat.id,
          telegramUserId: ctx.from.id,
          toUserId: alloc.toUserId,
          amount: alloc.allocatedAmount,
        });
      }

      paymentStateManager.clearState(ctx.chat.id, ctx.from.id);

      const successMsg = formatRepaySuccessMessage(activeAllocations, calcResult.totalAllocated);
      const successKeyboard = buildRepaySuccessKeyboard();

      await safeEdit(successMsg, successKeyboard);
    } catch (error: any) {
      logger.error('Failed to confirm /repay multi-settlement:', error);
      draft.step = 'AWAITING_REPAY_SELECTION';
      await ctx.reply(`⚠️ ${error.message || 'Failed to record repayment.'}`);
    }
    return true;
  }

  return false;
}
