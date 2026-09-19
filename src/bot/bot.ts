import { Bot, Context } from 'grammy';
import { logger } from '../shared/logger';
import { BotServices } from '../modules/services';
import { registerCommands } from './commands';
import { createCallbackRouter } from './callbacks';
import { createRegistrationMiddleware } from './middleware/registration.middleware';
import { handleExpenseTextInput } from '../modules/expenses/expense-flow';
import { handleExpenseEditTextInput } from './callbacks/expense-management-callbacks';
import { handlePaymentTextInput } from '../modules/settlements/payment-flow';
import { BOT_ADDED_TO_GROUP_MESSAGE, UNKNOWN_COMMAND_MESSAGE } from './messages';
import { buildGroupMenuKeyboard } from './keyboards';

export function createBot(token: string, services?: BotServices): Bot<Context> {
  const bot = new Bot<Context>(token);

  // Global error handler
  bot.catch((err) => {
    const ctx = err.ctx;
    logger.error(`Error occurred while handling update ${ctx.update.update_id}:`, err.error);
    try {
      if (ctx.chat) {
        void ctx.reply('⚠️ An unexpected error occurred. Please try again later.').catch(() => {});
      }
    } catch {
      // Ignore fallback notification failures
    }
  });

  // Auto-registration middleware for interacting users and groups
  if (services) {
    bot.use(createRegistrationMiddleware(services));
  }

  // Handle bot added to or removed from group
  bot.on('my_chat_member', async (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

    if (isGroup) {
      if (status === 'member' || status === 'administrator') {
        logger.info(`Bot added to group "${ctx.chat.title}" (${ctx.chat.id})`);
        if (services) {
          try {
            await services.groupService.registerGroup({
              id: ctx.chat.id,
              title: ctx.chat.title ?? null,
            });
          } catch (error) {
            logger.error('Failed to register group on bot add:', error);
          }
        }
        await ctx.reply(BOT_ADDED_TO_GROUP_MESSAGE, {
          parse_mode: 'Markdown',
          reply_markup: buildGroupMenuKeyboard(),
        });
      } else if (status === 'left' || status === 'kicked') {
        logger.info(`Bot removed from group "${ctx.chat.title}" (${ctx.chat.id})`);
      }
    }
  });

  // Also handle message:new_chat_members
  bot.on(':new_chat_members', async (ctx) => {
    const newMembers = ctx.message?.new_chat_members ?? [];
    const botWasAdded = newMembers.some((m) => m.id === ctx.me?.id);

    if (botWasAdded && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
      if (services) {
        try {
          await services.groupService.registerGroup({
            id: ctx.chat.id,
            title: ctx.chat.title ?? null,
          });
        } catch (error) {
          logger.error('Failed to register group on new_chat_members:', error);
        }
      }
      await ctx.reply(BOT_ADDED_TO_GROUP_MESSAGE, {
        parse_mode: 'Markdown',
        reply_markup: buildGroupMenuKeyboard(),
      });
    }
  });

  // Handle in-flow conversation text inputs (description, amount, custom splits)
  if (services) {
    bot.on('message:text', async (ctx, next) => {
      if (ctx.message?.text?.startsWith('/')) {
        await next();
        return;
      }
      const expenseHandled = await handleExpenseTextInput(ctx, services);
      if (expenseHandled) return;

      const expenseEditHandled = await handleExpenseEditTextInput(ctx, services);
      if (expenseEditHandled) return;

      const paymentHandled = await handlePaymentTextInput(ctx, services);
      if (paymentHandled) return;

      await next();
    });
  }

  // Register command handlers (/start, /help, /members, /add, /cancel, placeholders)
  registerCommands(bot, services);

  // Register callback query routing
  if (services) {
    bot.on('callback_query:data', createCallbackRouter(services));
  } else {
    bot.on('callback_query:data', async (ctx) => {
      await ctx.answerCallbackQuery();
    });
  }

  // Gracefully handle any unknown commands
  bot.on('message::bot_command', async (ctx) => {
    logger.debug(`Unhandled bot command received from chat ${ctx.chat.id}`);
    await ctx.reply(UNKNOWN_COMMAND_MESSAGE);
  });

  return bot;
}
