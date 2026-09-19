import { formatPaise } from '../../shared/currency';
import { ExpenseDraft } from '../../modules/expenses/expense-state';

export const EXPENSE_DESCRIPTION_PROMPT =
  `🍕 *What was this expense for?*\n\n` +
  `_Examples: Dinner, Cab, Hotel, Movie tickets_`;

export const EXPENSE_AMOUNT_PROMPT =
  `💰 *How much was it?*\n\n` +
  `_Enter the amount in ₹ (e.g. 2400 or 2400.50)_`;

export function formatPayerPrompt(amountPaise: number): string {
  return `👤 *Who paid ${formatPaise(amountPaise)}?*`;
}

export function formatParticipantsPrompt(description: string, amountPaise: number): string {
  return (
    `👥 *Who should split this expense?*\n\n` +
    `*${description}* — ${formatPaise(amountPaise)}\n\n` +
    `_Select who shared this expense:_`
  );
}

export function formatSplitTypePrompt(amountPaise: number): string {
  return `⚖️ *How should ${formatPaise(amountPaise)} be split?*`;
}

export const EXPENSE_SHARES_PROMPT =
  `🔢 *Give each person their number of shares.*\n\n` +
  `_Tap ➖ or ➕ to adjust shares for each participant:_`;

export function formatExpenseConfirmation(draft: ExpenseDraft): string {
  const typeLabel =
    draft.splitType === 'equal'
      ? '⚖️ Equal'
      : draft.splitType === 'custom'
      ? '💰 Custom'
      : draft.splitType === 'percentage'
      ? '📊 Percentage'
      : '🔢 Shares';

  const splitLines = draft.splits
    .map((s) => {
      let extra = '';
      if (s.shares !== null && s.shares !== undefined) {
        extra = ` (${s.shares} ${s.shares === 1 ? 'share' : 'shares'})`;
      } else if (s.percentage !== null && s.percentage !== undefined) {
        extra = ` (${s.percentage}%)`;
      }
      return `• ${s.name || 'Member'} — ${formatPaise(s.amount)}${extra}`;
    })
    .join('\n');

  return (
    `🧾 *${draft.description}*\n\n` +
    `💰 *Total:* ${formatPaise(draft.totalAmount || 0)}\n` +
    `👤 *Paid by:* ${draft.payerName || 'Payer'}\n\n` +
    `*Split:*\n` +
    `${splitLines}\n\n` +
    `*Method:* ${typeLabel}`
  );
}

export function formatExpenseSuccess(
  description: string,
  amountPaise: number,
  payerName: string
): string {
  return (
    `✅ *Expense added!*\n\n` +
    `🍕 *${description}* — ${formatPaise(amountPaise)}\n` +
    `👤 *Paid by ${payerName}*\n\n` +
    `_Your group balances will be updated in the next step._`
  );
}
