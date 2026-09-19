import { Context } from 'grammy';
import { z } from 'zod';
import { BotServices } from '../../modules/services';
import { GROUP_START_MESSAGE, PRIVATE_START_MESSAGE, HELP_MESSAGE } from '../messages';
import { buildGroupMenuKeyboard, buildPrivateMenuKeyboard, buildBackRow } from '../keyboards';
import { formatMembersListMessage } from '../messages/members';
import {
  formatUserPersonalBalance,
  formatGroupBalanceSummary,
} from '../../modules/balances/balance.formatter';
import {
  formatUserSettlementSummary,
  formatGroupSettlementPlan,
} from '../../modules/settlements/settlement.formatter';
import {
  buildUserSettlementKeyboard,
  buildGroupSettlementKeyboard,
} from '../keyboards/settlement.keyboard';
import { handleExpenseCallback } from './expense-callbacks';
import { handlePaymentCallback } from './payment-callbacks';
import { startExpenseFlow } from '../../modules/expenses/expense-flow';
import { logger } from '../../shared/logger';

const callbackDataSchema = z.string().min(1).max(64);

export function createCallbackRouter(services: BotServices) {
  return async (ctx: Context): Promise<void> => {
    const rawData = ctx.callbackQuery?.data;

    // 1. Validate callback data
    const parseResult = callbackDataSchema.safeParse(rawData);
    if (!parseResult.success) {
      try {
        await ctx.answerCallbackQuery({ text: '⚠️ Invalid button action.', show_alert: false });
      } catch {
        // Silently ignore if answering fails
      }
      return;
    }

    const data = parseResult.data;

    try {
      // 2. Route expense creation interactive callbacks
      if (data === 'action:add_expense') {
        await ctx.answerCallbackQuery();
        await startExpenseFlow(ctx, services);
        return;
      }

      const expenseHandled = await handleExpenseCallback(ctx, data, services);
      if (expenseHandled) {
        return;
      }

      const paymentHandled = await handlePaymentCallback(ctx, data, services);
      if (paymentHandled) {
        return;
      }

      // 3. Coming soon placeholders
      if (data.startsWith('coming_soon:')) {
        const feature = data.split(':')[1] || 'feature';
        const formatted = feature.replace(/_/g, ' ');
        await ctx.answerCallbackQuery({
          text: `⏳ ${formatted.charAt(0).toUpperCase() + formatted.slice(1)} is coming in the next update!`,
          show_alert: true,
        });
        return;
      }

      // 4. Menu & help actions
      if (data === 'menu:help') {
        await ctx.answerCallbackQuery();
        await ctx.reply(HELP_MESSAGE, {
          parse_mode: 'Markdown',
          reply_markup: ctx.chat?.type === 'private' ? buildBackRow('menu:private') : buildBackRow('menu:group'),
        });
        return;
      }

      if (data === 'menu:group') {
        await ctx.answerCallbackQuery();
        await ctx.reply(GROUP_START_MESSAGE, {
          reply_markup: buildGroupMenuKeyboard(),
        });
        return;
      }

      if (data === 'menu:private') {
        await ctx.answerCallbackQuery();
        await ctx.reply(PRIVATE_START_MESSAGE, {
          reply_markup: buildPrivateMenuKeyboard(ctx.me?.username),
        });
        return;
      }

      if (data === 'menu:add_to_group') {
        await ctx.answerCallbackQuery();
        await ctx.reply(
          '➕ *How to add BuddySplitter to a group:*\n\n1. Open your group in Telegram.\n2. Tap the group name at the top.\n3. Tap "Add Member".\n4. Search for this bot and select it.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      if (data === 'action:members') {
        await ctx.answerCallbackQuery();
        if (ctx.chat?.id) {
          const group = await services.groupService.getGroupByTelegramChatId(ctx.chat.id);
          if (group) {
            const members = await services.groupService.getActiveMembers(group.id);
            const memberDetails = await Promise.all(
              members.map(async (m) => {
                const user = await services.userService.getUserById(m.userId);
                return {
                  displayName: m.displayName || user?.firstName || 'Unnamed Member',
                  username: user?.username ?? null,
                };
              })
            );
            await ctx.reply(formatMembersListMessage(group.title, memberDetails), {
              parse_mode: 'Markdown',
              reply_markup: buildBackRow('menu:group'),
            });
            return;
          }
        }
        await ctx.reply('⚠️ Group information is not available. Please use /start inside the group.');
        return;
      }

      if (data === 'action:my_balance' || data === 'action:balance') {
        await ctx.answerCallbackQuery();
        if (!ctx.chat?.id || !ctx.from?.id) {
          await ctx.reply('⚠️ Unable to retrieve balance.');
          return;
        }
        try {
          const balance =
            typeof services.balanceService.getReconciledUserBalanceForTelegram === 'function'
              ? await services.balanceService.getReconciledUserBalanceForTelegram(
                  ctx.chat.id,
                  ctx.from.id
                )
              : await services.balanceService.getUserBalanceForTelegram(
                  ctx.chat.id,
                  ctx.from.id
                );
          await ctx.reply(formatUserPersonalBalance(balance), {
            parse_mode: 'Markdown',
            reply_markup: buildBackRow('menu:group'),
          });
        } catch (err: any) {
          await ctx.reply(`⚠️ ${err.message || 'Unable to retrieve balance.'}`);
        }
        return;
      }

      if (data === 'action:summary') {
        await ctx.answerCallbackQuery();
        if (!ctx.chat?.id || !ctx.from?.id) {
          await ctx.reply('⚠️ Unable to retrieve summary.');
          return;
        }
        try {
          const summary =
            typeof services.balanceService.getReconciledGroupSummaryForTelegram === 'function'
              ? await services.balanceService.getReconciledGroupSummaryForTelegram(
                  ctx.chat.id,
                  ctx.from.id
                )
              : await services.balanceService.getGroupSummaryForTelegram(
                  ctx.chat.id,
                  ctx.from.id
                );
          await ctx.reply(formatGroupBalanceSummary(summary), {
            parse_mode: 'Markdown',
            reply_markup: buildBackRow('menu:group'),
          });
        } catch (err: any) {
          await ctx.reply(`⚠️ ${err.message || 'Unable to retrieve summary.'}`);
        }
        return;
      }

      if (data === 'action:settle_up' || data === 'action:settle') {
        await ctx.answerCallbackQuery();
        if (!ctx.chat?.id || !ctx.from?.id) {
          await ctx.reply('⚠️ Unable to retrieve settlement recommendations.');
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
        } catch (err: any) {
          await ctx.reply(`⚠️ ${err.message || 'Unable to retrieve settlement recommendations.'}`);
        }
        return;
      }

      if (data === 'settle:full' || data === 'action:settle_full') {
        await ctx.answerCallbackQuery();
        if (!ctx.chat?.id || !ctx.from?.id) {
          await ctx.reply('⚠️ Unable to retrieve group settlement plan.');
          return;
        }
        try {
          const groupPlan =
            await services.settlementService.getGroupSettlementPlanForTelegram(
              ctx.chat.id,
              ctx.from.id
            );
          const message = formatGroupSettlementPlan(groupPlan);
          await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: buildGroupSettlementKeyboard(),
          });
        } catch (err: any) {
          await ctx.reply(`⚠️ ${err.message || 'Unable to retrieve group settlement plan.'}`);
        }
        return;
      }

      if (data === 'action:cancel') {
        await ctx.answerCallbackQuery({ text: 'Action cancelled.' });
        await ctx.reply('❌ Action cancelled.');
        return;
      }

      // Unrecognized action fallback
      await ctx.answerCallbackQuery({ text: '⚠️ Unrecognized button option.', show_alert: false });
    } catch (error) {
      logger.error(`Error processing callback query "${data}":`, error);
      try {
        await ctx.answerCallbackQuery({ text: '❌ An error occurred.', show_alert: true });
      } catch {
        // Silently ignore
      }
    }
  };
}
