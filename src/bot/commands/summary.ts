import { Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { formatGroupBalanceSummary } from '../../modules/balances/balance.formatter';
import { logger } from '../../shared/logger';

export function createSummaryCommandHandler(services: BotServices) {
  return async (ctx: Context): Promise<void> => {
    const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

    if (!isGroup || !ctx.chat || !ctx.from) {
      await ctx.reply('⚠️ Group summary is available inside a group.');
      return;
    }

    try {
      const summary =
        typeof services.balanceService.getReconciledGroupSummaryForTelegram === 'function'
          ? await services.balanceService.getReconciledGroupSummaryForTelegram(
              ctx.chat.id,
              ctx.from.id
            )
          : await services.balanceService.getGroupSummaryForTelegram(
              ctx.chat.id,
              ctx.from.id
            );

      const message = formatGroupBalanceSummary(summary);
      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error: any) {
      logger.error('Failed to get group summary:', error);
      await ctx.reply(`⚠️ ${error.message || 'Unable to retrieve summary at this time.'}`);
    }
  };
}
