import { Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { formatExpenseHistoryMessage } from '../messages/expense-management';
import { buildExpenseHistoryKeyboard } from '../keyboards/expense-management.keyboard';
import { logger } from '../../shared/logger';
import { safeErrorMessage } from '../../shared/errors';
import { checkUserRateLimit, RATE_LIMIT_EXCEEDED_MESSAGE } from '../../shared/rate-limiter';

export function createExpensesCommandHandler(services: BotServices) {
  return async (ctx: Context): Promise<void> => {
    const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

    if (!isGroup || !ctx.chat || !ctx.from) {
      await ctx.reply('⚠️ Expense history is only available inside a group.');
      return;
    }

    const rateCheck = checkUserRateLimit(ctx.from.id, 'QUERY');
    if (!rateCheck.allowed) {
      await ctx.reply(RATE_LIMIT_EXCEEDED_MESSAGE, { parse_mode: 'Markdown' });
      return;
    }

    try {
      const history = await services.expenseService.getExpenseHistoryForTelegram(
        ctx.chat.id,
        ctx.from.id,
        1
      );

      const message = formatExpenseHistoryMessage(history, ctx.chat.title);
      const keyboard = buildExpenseHistoryKeyboard(
        history.expenses,
        history.page,
        history.totalPages
      );

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (error: any) {
      logger.error('Failed to get expense history:', error);
      await ctx.reply(`⚠️ ${safeErrorMessage(error, 'Unable to retrieve expense history at this time.')}`);
    }
  };
}

