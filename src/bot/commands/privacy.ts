import { Context } from 'grammy';
import { checkUserRateLimit, RATE_LIMIT_EXCEEDED_MESSAGE } from '../../shared/rate-limiter';

export async function handlePrivacy(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (userId) {
    const rateCheck = checkUserRateLimit(userId, 'QUERY');
    if (!rateCheck.allowed) {
      await ctx.reply(RATE_LIMIT_EXCEEDED_MESSAGE, { parse_mode: 'Markdown' });
      return;
    }
  }

  const privacyUrl = process.env.PRIVACY_POLICY_URL?.trim();

  if (privacyUrl) {
    const message = [
      '🔒 *Privacy Policy*',
      '',
      'BuddySplitter respects your privacy and complies with Telegram Platform Developer guidelines.',
      '',
      `Read our full online policy here:`,
      `[BuddySplitter Privacy Policy](${privacyUrl})`,
      '',
      '• *Data Minimization*: We only store data strictly needed for expense splitting (Telegram ID, name, splits, repayments).',
      '• *No Message Scraping*: BuddySplitter never logs, reads, or stores general chat messages.',
      '• *User Control*: Use /my\\_data to view your data or /delete\\_my\\_data to request profile anonymization.',
      '',
      '_This document describes BuddySplitter’s intended data practices. Applicable legal requirements may vary by jurisdiction._',
    ].join('\n');

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
    });

    return;
  }

  const fallback = [
    '🔒 *Privacy Policy*',
    '',
    'BuddySplitter’s privacy policy URL is not configured yet.',
    '',
    '• *Data Minimization*: We store only what is needed for expense tracking (names, splits, repayments).',
    '• *No Message Scraping*: BuddySplitter never reads or saves general chat messages.',
    '• *Your Control*: Use /my\\_data to inspect your stored information or /delete\\_my\\_data to anonymize your profile.',
    '',
    '_This document describes BuddySplitter’s intended data practices. Applicable legal requirements may vary by jurisdiction._',
  ].join('\n');

  await ctx.reply(fallback, { parse_mode: 'Markdown' });
}
