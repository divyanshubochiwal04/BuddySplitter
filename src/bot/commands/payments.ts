import { Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { formatPaise } from '../../shared/currency';
import { buildPaymentsHistoryKeyboard } from '../keyboards/settlement.keyboard';
import { logger } from '../../shared/logger';
import { safeErrorMessage } from '../../shared/errors';
import { checkUserRateLimit, RATE_LIMIT_EXCEEDED_MESSAGE } from '../../shared/rate-limiter';

function formatDate(isoString: string): string {

  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return isoString;
  }
}

export function createPaymentsCommandHandler(services: BotServices) {
  return async (ctx: Context): Promise<void> => {
    const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

    if (!isGroup || !ctx.chat || !ctx.from) {
      await ctx.reply('⚠️ Payment history is available inside a group.');
      return;
    }

    const rateCheck = checkUserRateLimit(ctx.from.id, 'QUERY');
    if (!rateCheck.allowed) {
      await ctx.reply(RATE_LIMIT_EXCEEDED_MESSAGE, { parse_mode: 'Markdown' });
      return;
    }

    try {

      const { payments } =
        await services.settlementService.getRecentPaymentsForTelegram(
          ctx.chat.id,
          ctx.from.id,
          10
        );

      if (payments.length === 0) {
        await ctx.reply(
          `💸 *Payment History*\n\n` +
            `_No payments recorded yet in this group._\n\n` +
            `Use /settle to view and record payments.`,
          {
            parse_mode: 'Markdown',
            reply_markup: buildPaymentsHistoryKeyboard(),
          }
        );
        return;
      }

      const lines: string[] = [`💸 *Recent Payments*\n`];

      for (const p of payments) {
        lines.push(`• *${p.fromDisplayName}* paid *${p.toDisplayName}* ${formatPaise(p.amount)}`);
        lines.push(`  _${formatDate(p.settledAt)}_`);
      }

      lines.push('');
      const countLabel = payments.length === 1 ? '1 payment' : `${payments.length} payments`;
      lines.push(`_Showing last ${countLabel}_`);

      await ctx.reply(lines.join('\n'), {
        parse_mode: 'Markdown',
        reply_markup: buildPaymentsHistoryKeyboard(),
      });
    } catch (error: any) {
      logger.error('Failed to get payment history:', error);
      await ctx.reply(`⚠️ ${safeErrorMessage(error, 'Unable to retrieve payment history at this time.')}`);
    }
  };
}

