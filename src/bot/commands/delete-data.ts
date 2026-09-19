import { Context, InlineKeyboard } from 'grammy';
import { BotServices } from '../../modules/services';
import { checkUserRateLimit, RATE_LIMIT_EXCEEDED_MESSAGE } from '../../shared/rate-limiter';
import { logger } from '../../shared/logger';
import { safeErrorMessage } from '../../shared/errors';

export function createDeleteDataCommandHandler(services: BotServices) {
  return async (ctx: Context): Promise<void> => {
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply('⚠️ Unable to identify your Telegram account.');
      return;
    }

    const rateCheck = checkUserRateLimit(userId, 'MUTATION');
    if (!rateCheck.allowed) {
      await ctx.reply(RATE_LIMIT_EXCEEDED_MESSAGE, { parse_mode: 'Markdown' });
      return;
    }

    try {
      const user = await services.userService.getUserByTelegramId(userId);
      if (!user) {
        await ctx.reply(
          'ℹ️ *No stored records found.*\n\nThere is no personal data registered for your Telegram profile in BuddySplitter.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const prompt = [
        '⚠️ *Delete & Anonymize My Data*',
        '',
        'Are you sure you want to delete your personal data from BuddySplitter?',
        '',
        '*What will be deleted / anonymized:*',
        '• Your personal profile (name, username, Telegram ID associations)',
        '• Your group memberships will be deactivated and marked as *Former Member*',
        '• Any active expense/payment creation drafts will be cleared immediately',
        '',
        '*What will be retained for accounting integrity:*',
        '• Past expense records, splits, and settlement receipts',
        '• These shared financial ledger entries are preserved anonymously without personal identifiers so group balances and debts do not get corrupted or broken for other members.',
        '',
        '_This action cannot be undone._',
      ].join('\n');

      const keyboard = new InlineKeyboard()
        .text('⚠️ Yes, Delete My Data', `deldata:confirm:${userId}`)
        .text('❌ Cancel', `deldata:cancel:${userId}`);

      await ctx.reply(prompt, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (error) {
      logger.error('Error handling /delete_my_data command:', error);
      await ctx.reply(`⚠️ ${safeErrorMessage(error, 'Unable to process deletion request at this time.')}`);
    }
  };
}
