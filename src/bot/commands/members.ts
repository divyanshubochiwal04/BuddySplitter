import { CommandContext, Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { formatMembersListMessage } from '../messages/members';
import { buildBackRow } from '../keyboards';
import { logger } from '../../shared/logger';

export function createMembersHandler(services: BotServices) {
  return async (ctx: CommandContext<Context>): Promise<void> => {
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

    if (!isGroup) {
      await ctx.reply(
        'ℹ️ Members can only be viewed inside a group chat. Add me to a group to get started!',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    try {
      const group = await services.groupService.getGroupByTelegramChatId(ctx.chat.id);
      if (!group) {
        await ctx.reply('⚠️ This group is not yet registered. Type /start to register.');
        return;
      }

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

      const message = formatMembersListMessage(group.title, memberDetails);
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: buildBackRow('menu:group'),
      });
    } catch (error) {
      logger.error('Failed to retrieve members list:', error);
      await ctx.reply('❌ An error occurred while retrieving members. Please try again.');
    }
  };
}
