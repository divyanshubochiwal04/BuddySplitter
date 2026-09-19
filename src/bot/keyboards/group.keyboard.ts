import { InlineKeyboard } from 'grammy';

export function buildGroupMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('➕ Add Expense', 'action:add_expense')
    .text('💰 My Balance', 'action:my_balance')
    .row()
    .text('📊 Summary', 'action:summary')
    .text('💸 Settle Up', 'action:settle_up')
    .row()
    .text('📋 Expenses', 'action:expenses')
    .text('👥 Members', 'action:members');
}
