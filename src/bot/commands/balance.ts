import { Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { formatUserPersonalBalance } from '../../modules/balances/balance.formatter';
import { logger } from '../../shared/logger';
import { safeErrorMessage } from '../../shared/errors';
import { checkUserRateLimit, RATE_LIMIT_EXCEEDED_MESSAGE } from '../../shared/rate-limiter';

export function createBalanceCommandHandler(services: BotServices) {
  return async (ctx: Context): Promise<void> => {
    const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

    if (!isGroup || !ctx.chat || !ctx.from) {
      await ctx.reply('⚠️ Balance is available inside a group.');
      return;
    }

    const rateCheck = checkUserRateLimit(ctx.from.id, 'QUERY');
    if (!rateCheck.allowed) {
      await ctx.reply(RATE_LIMIT_EXCEEDED_MESSAGE, { parse_mode: 'Markdown' });
      return;
    }

    try {
      const balance =
        typeof services.balanceService.getReconciledUserBalanceForTelegram === 'function'
          ? await services.balanceService.getReconciledUserBalanceForTelegram(
              ctx.chat.id,
              ctx.from.id
            )
          : await services.balanceService.getUserBalanceForTelegram(
              ctx.chat.id,
              ctx.from.id
            );

      const message = formatUserPersonalBalance(balance);
      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error: any) {
      logger.error('Failed to get user balance:', error);
      await ctx.reply(`⚠️ ${safeErrorMessage(error, 'Unable to retrieve balance at this time.')}`);
    }
  };
}

