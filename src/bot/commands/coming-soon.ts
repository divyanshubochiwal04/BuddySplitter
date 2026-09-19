import { CommandContext, Context } from 'grammy';
import { escapeMarkdown } from '../../shared/markdown';

export function createComingSoonHandler(featureName: string) {
  return async (ctx: CommandContext<Context>): Promise<void> => {
    await ctx.reply(
      `⏳ *${escapeMarkdown(featureName)}* is coming in the upcoming update!\n\nType /help to see current features.`,
      { parse_mode: 'Markdown' }
    );
  };
}
