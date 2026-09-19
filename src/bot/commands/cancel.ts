import { CommandContext, Context } from 'grammy';
import { expenseStateManager } from '../../modules/expenses/expense-state';

export async function handleCancel(ctx: CommandContext<Context>): Promise<void> {
  let hadDraft = false;
  if (ctx.chat && ctx.from) {
    const existing = expenseStateManager.getState(ctx.chat.id, ctx.from.id);
    if (existing) {
      expenseStateManager.clearState(ctx.chat.id, ctx.from.id);
      hadDraft = true;
    }
  }

  if (hadDraft) {
    await ctx.reply('❌ Active expense creation cancelled.');
  } else {
    await ctx.reply('ℹ️ No active action to cancel.');
  }
}
