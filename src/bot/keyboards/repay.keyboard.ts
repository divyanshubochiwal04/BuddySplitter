import { InlineKeyboard } from 'grammy';
import { formatPaise } from '../../shared/currency';
import {
  RepayCalculationResult,
  RepayDebtItem,
} from '../../modules/settlements/repay-calculator';

export function buildRepaySelectionKeyboard(
  debts: RepayDebtItem[],
  selectedUserIds: string[],
  calcResult: RepayCalculationResult
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  const selectedSet = new Set(selectedUserIds);
  const allocMap = new Map(calcResult.allocations.map((a) => [a.toUserId, a]));

  // Toggle button per debt
  for (const debt of debts) {
    const isSelected = selectedSet.has(debt.toUserId);
    if (isSelected) {
      const alloc = allocMap.get(debt.toUserId);
      if (alloc && alloc.isFull) {
        keyboard
          .text(`☑️ ${debt.toDisplayName}: ${formatPaise(debt.debtAmount)} (Full)`, `rpy:tog:${debt.toUserId}`)
          .row();
      } else if (alloc && alloc.allocatedAmount > 0) {
        keyboard
          .text(
            `☑️ ${debt.toDisplayName}: ${formatPaise(alloc.allocatedAmount)} (Rem: ${formatPaise(alloc.remainingDebt)})`,
            `rpy:tog:${debt.toUserId}`
          )
          .row();
      } else {
        keyboard
          .text(`☑️ ${debt.toDisplayName}: ₹0 (Rem: ${formatPaise(debt.debtAmount)})`, `rpy:tog:${debt.toUserId}`)
          .row();
      }
    } else {
      keyboard
        .text(`◻️ ${debt.toDisplayName}: ${formatPaise(debt.debtAmount)}`, `rpy:tog:${debt.toUserId}`)
        .row();
    }
  }

  // Action helpers (if more than 1 debt)
  if (debts.length > 1) {
    keyboard
      .text('⚡ Auto-Fill', 'rpy:autofill')
      .text('Select All', 'rpy:all')
      .text('Clear', 'rpy:clear')
      .row();
  }

  // Confirmation & Cancel
  if (calcResult.totalAllocated > 0) {
    keyboard.text(`✅ Confirm Repay (${formatPaise(calcResult.totalAllocated)})`, 'rpy:confirm');
  }
  keyboard.text('❌ Cancel', 'rpy:cancel');

  return keyboard;
}

export function buildRepayNoAmountKeyboard(debts: RepayDebtItem[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const debt of debts) {
    keyboard
      .text(`Pay ${debt.toDisplayName} (${formatPaise(debt.debtAmount)})`, `rpy:payone:${debt.toUserId}`)
      .row();
  }

  if (debts.length > 1) {
    const total = debts.reduce((sum, d) => sum + d.debtAmount, 0);
    keyboard.text(`⚡ Pay All (${formatPaise(total)})`, 'rpy:payall').row();
  }

  keyboard.text('❌ Cancel', 'rpy:cancel');
  return keyboard;
}

export function buildRepaySuccessKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📊 View Balances', 'action:summary')
    .text('💸 Settle More', 'action:settle_up');
}
