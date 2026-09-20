import { CommandContext, Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { handleAddCommand } from '../../modules/expenses/expense-flow';

export function createAddHandler(services: BotServices) {
  return async (ctx: CommandContext<Context>): Promise<void> => {
    await handleAddCommand(ctx, services);
  };
}


