import { CommandContext, Context } from 'grammy';
import { expenseStateManager } from '../../modules/expenses/expense-state';
import { paymentStateManager } from '../../modules/settlements/payment-state';
import { expenseEditStateManager } from '../../modules/expenses/expense-edit-state';

export async function handleCancel(ctx: CommandContext<Context>): Promise<void> {
  let hadActiveAction = false;
  if (ctx.chat && ctx.from) {
    if (expenseStateManager.getState(ctx.chat.id, ctx.from.id)) {
      expenseStateManager.clearState(ctx.chat.id, ctx.from.id);
      hadActiveAction = true;
    }
    if (paymentStateManager.getState(ctx.chat.id, ctx.from.id)) {
      paymentStateManager.clearState(ctx.chat.id, ctx.from.id);
      hadActiveAction = true;
    }
    if (expenseEditStateManager.getState(ctx.chat.id, ctx.from.id)) {
      expenseEditStateManager.clearState(ctx.chat.id, ctx.from.id);
      hadActiveAction = true;
    }
  }

  if (hadActiveAction) {
    await ctx.reply('❌ Action cancelled.');
  } else {
    await ctx.reply('ℹ️ No active action to cancel.');
  }
}
