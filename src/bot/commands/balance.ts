import { Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { formatUserPersonalBalance } from '../../modules/balances/balance.formatter';
import { logger } from '../../shared/logger';

export function createBalanceCommandHandler(services: BotServices) {
  return async (ctx: Context): Promise<void> => {
    const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

    if (!isGroup || !ctx.chat || !ctx.from) {
      await ctx.reply('⚠️ Balance is available inside a group.');
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
      await ctx.reply(`⚠️ ${error.message || 'Unable to retrieve balance at this time.'}`);
    }
  };
}
