import { Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { formatUserSettlementSummary } from '../../modules/settlements/settlement.formatter';
import { buildUserSettlementKeyboard } from '../keyboards/settlement.keyboard';
import { logger } from '../../shared/logger';

export function createSettleCommandHandler(services: BotServices) {
  return async (ctx: Context): Promise<void> => {
    const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

    if (!isGroup || !ctx.chat || !ctx.from) {
      await ctx.reply('⚠️ Settlement is available inside a group.');
      return;
    }

    try {
      const { userSummary, groupPlan } =
        await services.settlementService.getUserSettlementSummaryForTelegram(
          ctx.chat.id,
          ctx.from.id
        );

      const message = formatUserSettlementSummary(userSummary);
      const keyboard = buildUserSettlementKeyboard(
        groupPlan.transactions.length > 0,
        userSummary.payments.length > 0
      );

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (error: any) {
      logger.error('Failed to get settlement recommendations:', error);
      await ctx.reply(`⚠️ ${error.message || 'Unable to retrieve settlement plan at this time.'}`);
    }
  };
}
