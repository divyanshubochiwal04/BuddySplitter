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
import { createSettleCommandHandler } from './settle';
import { createPaymentsCommandHandler } from './payments';
import { createExpensesCommandHandler } from './expenses';
import { handlePrivacy } from './privacy';
import { createMyDataCommandHandler } from './my-data';
import { createDeleteDataCommandHandler } from './delete-data';

export function registerCommands(bot: Bot<Context>, services?: BotServices): void {
  if (services) {
    bot.command('start', createStartHandler(services));
    bot.command('members', createMembersHandler(services));
    bot.command('add', createAddHandler(services));
    bot.command('balance', createBalanceCommandHandler(services));
    bot.command('summary', createSummaryCommandHandler(services));
    bot.command('settle', createSettleCommandHandler(services));
    bot.command('payments', createPaymentsCommandHandler(services));
    bot.command('expenses', createExpensesCommandHandler(services));
    bot.command('my_data', createMyDataCommandHandler(services));
    bot.command('delete_my_data', createDeleteDataCommandHandler(services));
  } else {
    bot.command('start', handleStart);
    bot.command('add', createComingSoonHandler('Expense Tracking (/add)'));
    bot.command('balance', createComingSoonHandler('Personal Balance (/balance)'));
    bot.command('summary', createComingSoonHandler('Group Summary (/summary)'));
    bot.command('settle', createComingSoonHandler('Settlement Engine (/settle)'));
    bot.command('payments', createComingSoonHandler('Payment History (/payments)'));
    bot.command('expenses', createComingSoonHandler('Expense History (/expenses)'));
    bot.command('my_data', createComingSoonHandler('My Data (/my_data)'));
    bot.command('delete_my_data', createComingSoonHandler('Delete My Data (/delete_my_data)'));
  }

  bot.command('help', handleHelp);
  bot.command('cancel', handleCancel);
  bot.command('privacy', handlePrivacy);
}


export * from './start';
export * from './help';
export * from './members';
export * from './cancel';
export * from './add';
export * from './balance';
export * from './summary';
export * from './settle';
export * from './payments';
export * from './expenses';
export * from './coming-soon';
export * from './privacy';
export * from './my-data';
export * from './delete-data';

