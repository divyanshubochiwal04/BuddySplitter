import { Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { checkUserRateLimit, RATE_LIMIT_EXCEEDED_MESSAGE } from '../../shared/rate-limiter';
import { toPaise } from '../../shared/currency';
import { logger } from '../../shared/logger';
import { paymentStateManager } from '../../modules/settlements/payment-state';
import {
  autoSelectDebtsForAmount,
  calculateRepayAllocations,
  RepayDebtItem,
} from '../../modules/settlements/repay-calculator';
import {
  formatRepayNoAmountMessage,
  formatRepaySelectionMessage,
} from '../messages/repay';
import {
  buildRepayNoAmountKeyboard,
  buildRepaySelectionKeyboard,
} from '../keyboards/repay.keyboard';

export function extractRepayCommandArgs(ctx: Context): string {
  if (typeof (ctx as any).match === 'string' && (ctx as any).match.trim().length > 0) {
    return (ctx as any).match.trim();
  }
  const text = ctx.message?.text?.trim() || '';
  const match = text.match(/^\/repay(?:@\w+)?(?:\s+(.*))?$/is);
  return match?.[1]?.trim() || '';
}

export function createRepayCommandHandler(services: BotServices) {
  return async (ctx: Context): Promise<void> => {
    const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

    if (!isGroup || !ctx.chat || !ctx.from) {
      await ctx.reply('⚠️ Repayments can only be made inside a group.');
      return;
    }

    const rateCheck = checkUserRateLimit(ctx.from.id, 'QUERY');
    if (!rateCheck.allowed) {
      await ctx.reply(RATE_LIMIT_EXCEEDED_MESSAGE, { parse_mode: 'Markdown' });
      return;
    }

    try {
      const { userSummary, groupPlan } =
        await services.settlementService.getUserSettlementSummaryForTelegram(
          ctx.chat.id,
          ctx.from.id
        );

      if (userSummary.payments.length === 0) {
        await ctx.reply('🎉 You do not have any outstanding debts to repay in this group!');
        return;
      }

      const debts: RepayDebtItem[] = userSummary.payments.map((p) => ({
        toUserId: p.toUserId,
        toDisplayName: p.toDisplayName,
        debtAmount: p.amount,
      }));

      const arg = extractRepayCommandArgs(ctx);

      if (!arg) {
        // No amount provided: show debts list with quick-pay buttons
        paymentStateManager.setState({
          chatId: ctx.chat.id,
          userId: ctx.from.id,
          groupId: groupPlan.groupId,
          payerUserId: userSummary.userId,
          payerDisplayName: userSummary.displayName,
          step: 'AWAITING_REPAY_SELECTION',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          repayDebts: debts,
          selectedRecipientIds: [],
        });

        await ctx.reply(formatRepayNoAmountMessage(debts), {
          parse_mode: 'Markdown',
          reply_markup: buildRepayNoAmountKeyboard(debts),
        });
        return;
      }

      // Parse amount
      let targetAmountPaise: number;
      try {
        targetAmountPaise = toPaise(arg);
      } catch {
        await ctx.reply('⚠️ Please enter a valid positive amount. Example: `/repay 450`', {
          parse_mode: 'Markdown',
        });
        return;
      }

      if (targetAmountPaise <= 0) {
        await ctx.reply('⚠️ Repay amount must be greater than 0.');
        return;
      }

      // If single debt: auto-select it.
      // If multiple debts: auto-select debts that best match targetAmount.
      const selectedUserIds =
        debts.length === 1
          ? [debts[0].toUserId]
          : autoSelectDebtsForAmount(targetAmountPaise, debts);

      const calcResult = calculateRepayAllocations(targetAmountPaise, debts, selectedUserIds);

      paymentStateManager.setState({
        chatId: ctx.chat.id,
        userId: ctx.from.id,
        groupId: groupPlan.groupId,
        payerUserId: userSummary.userId,
        payerDisplayName: userSummary.displayName,
        step: 'AWAITING_REPAY_SELECTION',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        repayTargetAmount: targetAmountPaise,
        repayDebts: debts,
        selectedRecipientIds: selectedUserIds,
      });

      const message = formatRepaySelectionMessage(targetAmountPaise, debts, calcResult);
      const keyboard = buildRepaySelectionKeyboard(debts, selectedUserIds, calcResult);

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (error: any) {
      logger.error('Failed to handle /repay command:', error);
      await ctx.reply(`⚠️ ${error.message || 'Unable to process repayment at this time.'}`);
    }
  };
}
