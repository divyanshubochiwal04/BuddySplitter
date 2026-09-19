import { CommandContext, Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { startExpenseFlow } from '../../modules/expenses/expense-flow';

export function createAddHandler(services: BotServices) {
  return async (ctx: CommandContext<Context>): Promise<void> => {
    await startExpenseFlow(ctx, services);
  };
}
