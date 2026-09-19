import { Context, NextFunction } from 'grammy';
import { BotServices } from '../../modules/services';
import { logger } from '../../shared/logger';

export function createRegistrationMiddleware(services: BotServices) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    if (ctx.from && !ctx.from.is_bot) {
      try {
        const user = await services.userService.registerUser({
          id: ctx.from.id,
          first_name: ctx.from.first_name,
          last_name: ctx.from.last_name ?? null,
          username: ctx.from.username ?? null,
        });

        if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
          const group = await services.groupService.registerGroup({
            id: ctx.chat.id,
            title: ctx.chat.title ?? null,
          });

          const displayName = [ctx.from.first_name, ctx.from.last_name]
            .filter(Boolean)
            .join(' ');

          await services.groupService.registerMember(group.id, user.id, displayName || ctx.from.first_name);
        }
      } catch (error) {
        logger.error('Error during automatic user/group registration:', error);
      }
    }

    await next();
  };
}
