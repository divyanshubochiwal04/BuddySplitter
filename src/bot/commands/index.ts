import { Bot, Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { createStartHandler, handleStart } from './start';
import { handleHelp } from './help';
import { createMembersHandler } from './members';
import { handleCancel } from './cancel';
import { createAddHandler } from './add';
import { createComingSoonHandler } from './coming-soon';
import { createBalanceCommandHandler } from './balance';
import { createSummaryCommandHandler } from './summary';

export function registerCommands(bot: Bot<Context>, services?: BotServices): void {
  if (services) {
    bot.command('start', createStartHandler(services));
    bot.command('members', createMembersHandler(services));
    bot.command('add', createAddHandler(services));
    bot.command('balance', createBalanceCommandHandler(services));
    bot.command('summary', createSummaryCommandHandler(services));
  } else {
    bot.command('start', handleStart);
    bot.command('add', createComingSoonHandler('Expense Tracking (/add)'));
    bot.command('balance', createComingSoonHandler('Personal Balance (/balance)'));
    bot.command('summary', createComingSoonHandler('Group Summary (/summary)'));
  }

  bot.command('help', handleHelp);
  bot.command('cancel', handleCancel);

  // Informative placeholders for future phase commands
  bot.command('settle', createComingSoonHandler('Settlement Engine (/settle)'));
  bot.command('expenses', createComingSoonHandler('Expense History (/expenses)'));
}

export * from './start';
export * from './help';
export * from './members';
export * from './cancel';
export * from './add';
export * from './balance';
export * from './summary';
export * from './coming-soon';
