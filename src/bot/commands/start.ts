import { CommandContext, Context } from 'grammy';
import { PRIVATE_START_MESSAGE, GROUP_START_MESSAGE } from '../messages';
import { buildPrivateMenuKeyboard, buildGroupMenuKeyboard } from '../keyboards';
import { BotServices } from '../../modules/services';

export function createStartHandler(_services: BotServices) {
  return async (ctx: CommandContext<Context>): Promise<void> => {
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

    if (isGroup) {
      await ctx.reply(GROUP_START_MESSAGE, {
        reply_markup: buildGroupMenuKeyboard(),
      });
    } else {
      await ctx.reply(PRIVATE_START_MESSAGE, {
        reply_markup: buildPrivateMenuKeyboard(ctx.me?.username),
      });
    }
  };
}

// Backward compatibility export
export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
  const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
  if (isGroup) {
    await ctx.reply(GROUP_START_MESSAGE, { reply_markup: buildGroupMenuKeyboard() });
  } else {
    await ctx.reply(PRIVATE_START_MESSAGE, { reply_markup: buildPrivateMenuKeyboard(ctx.me?.username) });
  }
}
