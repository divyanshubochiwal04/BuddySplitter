import { CommandContext, Context } from 'grammy';

export function createComingSoonHandler(featureName: string) {
  return async (ctx: CommandContext<Context>): Promise<void> => {
    await ctx.reply(
      `⏳ *${featureName}* is coming in the upcoming update!\n\nType /help to see current features.`,
      { parse_mode: 'Markdown' }
    );
  };
}
