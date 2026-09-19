import { InlineKeyboard } from 'grammy';

/**
 * Keyboard for personal user settlement view.
 * Shows [📊 Full Plan] button if group has active transactions, and [◀️ Back] button.
 */
export function buildUserSettlementKeyboard(hasGroupTransactions: boolean): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (hasGroupTransactions) {
    keyboard.text('📊 Full Plan', 'settle:full').row();
  }
  keyboard.text('◀️ Back', 'menu:group');
  return keyboard;
}

/**
 * Keyboard for full group settlement plan view.
 * Shows [👤 My Settlements] button and [◀️ Back] button.
 */
export function buildGroupSettlementKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('👤 My Settlements', 'action:settle_up')
    .row()
    .text('◀️ Back', 'menu:group');
}
