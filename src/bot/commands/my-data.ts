import { Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { escapeMarkdown } from '../../shared/markdown';
import { checkUserRateLimit, RATE_LIMIT_EXCEEDED_MESSAGE } from '../../shared/rate-limiter';
import { logger } from '../../shared/logger';
import { safeErrorMessage } from '../../shared/errors';

export function createMyDataCommandHandler(services: BotServices) {
  return async (ctx: Context): Promise<void> => {
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply('⚠️ Unable to identify your Telegram account.');
      return;
    }

    const rateCheck = checkUserRateLimit(userId, 'QUERY');
    if (!rateCheck.allowed) {
      await ctx.reply(RATE_LIMIT_EXCEEDED_MESSAGE, { parse_mode: 'Markdown' });
      return;
    }

    try {
      const data = await services.userService.getUserDataExport(userId);

      if (!data) {
        await ctx.reply(
          '👤 *Your BuddySplitter Data*\n\n_No account records found for your Telegram profile._\n\nYou haven’t participated in any shared expenses or groups yet.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const registeredDate = data.registeredAt.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      });

      const message = [
        '👤 *Your BuddySplitter Stored Data*',
        '',
        `• *Telegram ID*: \`${data.telegramUserId}\``,
        `• *Name*: ${escapeMarkdown(data.name)}`,
        `• *Username*: ${data.username ? '@' + escapeMarkdown(data.username) : '_None_'}`,
        `• *First Registered*: ${registeredDate}`,
        '',
        '📊 *Shared Accounting Summary*',
        `• Active Group Memberships: *${data.activeGroupsCount}*`,
        `• Expenses Created: *${data.expensesCreatedCount}*`,
        `• Expenses Paid by You: *${data.expensesPaidCount}*`,
        `• Settlements Recorded: *${data.settlementsCount}*`,
        '',
        '🔒 *Privacy & Data Rights*',
        'BuddySplitter only retains operational expense accounting records.',
        'To remove your personal identity data, use /delete\\_my\\_data.',
      ].join('\n');

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error handling /my_data command:', error);
      await ctx.reply(`⚠️ ${safeErrorMessage(error, 'Unable to retrieve your data at this time.')}`);
    }
  };
}
