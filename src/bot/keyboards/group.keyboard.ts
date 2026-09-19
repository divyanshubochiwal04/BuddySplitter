import { InlineKeyboard } from 'grammy';

export function buildGroupMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('➕ Add Expense', 'action:add_expense')
    .text('💰 My Balance', 'action:my_balance')
    .row()
    .text('📊 Summary', 'action:summary')
    .text('💸 Settle Up', 'coming_soon:settle_up')
    .row()
    .text('📜 Expenses', 'coming_soon:expenses')
    .text('👥 Members', 'action:members');
}
