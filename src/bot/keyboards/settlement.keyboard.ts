import { InlineKeyboard } from 'grammy';
import { SettlementTransaction } from '../../modules/settlements/settlement.types';
import { formatPaise } from '../../shared/currency';

/**
 * Keyboard for personal user settlement view.
 * Shows [💸 Record Payment] if user has debts, [📊 Full Plan] button if group has active transactions, and [◀️ Back] button.
 */
export function buildUserSettlementKeyboard(
  hasGroupTransactions: boolean,
  canRecordPayment = false
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (canRecordPayment) {
    keyboard.text('💸 Record Payment', 'pay:start').row();
  }
  if (hasGroupTransactions) {
    keyboard.text('📊 Full Plan', 'settle:full').row();
  }
  keyboard.text('◀️ Back', 'menu:group');
  return keyboard;
}

/**
 * Keyboard for selecting which recipient to repay.
 */
export function buildPaymentRecipientsKeyboard(
  payments: SettlementTransaction[]
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const tx of payments) {
    keyboard
      .text(`Pay ${tx.toDisplayName} (${formatPaise(tx.amount)})`, `pay:to:${tx.toUserId}`)
      .row();
  }
  keyboard.text('❌ Cancel', 'pay:cancel');
  return keyboard;
}

/**
 * Keyboard for choosing full amount vs custom amount.
 */
export function buildPaymentAmountChoiceKeyboard(maxAmount: number): InlineKeyboard {
  return new InlineKeyboard()
    .text(`Full: ${formatPaise(maxAmount)}`, 'pay:amt:full')
    .row()
    .text('Partial Amount', 'pay:amt:custom')
    .row()
    .text('❌ Cancel', 'pay:cancel');
}

/**
 * Keyboard for payment confirmation.
 */
export function buildPaymentConfirmationKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm Payment', 'pay:confirm')
    .row()
    .text('❌ Cancel', 'pay:cancel');
}

/**
 * Keyboard displayed after payment is successfully recorded.
 */
export function buildPaymentSuccessKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('💸 Settle Up', 'action:settle_up')
    .text('📊 Balances', 'action:view_balances');
}

/**
 * Keyboard with just a cancel button during text input.
 */
export function buildCancelPaymentKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('❌ Cancel', 'pay:cancel');
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

/**
 * Keyboard for /payments command output.
 */
export function buildPaymentsHistoryKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('💸 Settle Up', 'action:settle_up')
    .row()
    .text('◀️ Back', 'menu:group');
}

