import { CommandContext, Context } from 'grammy';
import { HELP_MESSAGE } from '../messages';

export async function handleHelp(ctx: CommandContext<Context>): Promise<void> {
  await ctx.reply(HELP_MESSAGE, { parse_mode: 'Markdown' });
}
