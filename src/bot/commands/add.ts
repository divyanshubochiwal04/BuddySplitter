import { CommandContext, Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { startExpenseFlow } from '../../modules/expenses/expense-flow';
import { checkUserRateLimit, RATE_LIMIT_EXCEEDED_MESSAGE } from '../../shared/rate-limiter';

export function createAddHandler(services: BotServices) {
  return async (ctx: CommandContext<Context>): Promise<void> => {
    if (ctx.from?.id) {
      const rateCheck = checkUserRateLimit(ctx.from.id, 'MUTATION');
      if (!rateCheck.allowed) {
        await ctx.reply(RATE_LIMIT_EXCEEDED_MESSAGE, { parse_mode: 'Markdown' });
        return;
      }
    }
    const initialText = ctx.match?.trim();
    await startExpenseFlow(ctx, services, initialText);
  };
}

