import { InlineKeyboard } from 'grammy';

export function buildGroupMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('➕ Add Expense', 'action:add_expense')
    .text('📋 Expenses', 'action:expenses')
    .row()
    .text('💰 My Balance', 'action:my_balance')
    .text('📊 Group Summary', 'action:summary')
    .row()
    .text('💸 Settle Up', 'action:settle_up')
    .text('💳 Payments', 'action:payments')
    .row()
    .text('👥 Members', 'action:members')
    .text('❓ Help', 'menu:help');
}
