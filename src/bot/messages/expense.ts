import { formatPaise } from '../../shared/currency';
import { ExpenseDraft } from '../../modules/expenses/expense-state';
import { escapeMarkdown } from '../../shared/markdown';

export const QUICK_ADD_PROMPT =
  `➕ *Add Expense*\n\n` +
  `Send:\n` +
  `\`Dinner 1200\`\n\n` +
  `*Examples:*\n` +
  `\`Dinner 450\`\n` +
  `\`Cab 300\`\n` +
  `\`Hotel 2500\``;

export const CMD_ADD_MISSING_AMOUNT_MESSAGE =
  `❌ *I need the amount too.*\n\n` +
  `Try:\n` +
  `\`/add dinner 1200\`\n\n` +
  `or:\n` +
  `\`Dinner 1200\``;

export const CMD_ADD_INVALID_AMOUNT_MESSAGE =
  `❌ *Invalid amount.*\n\n` +
  `Example:\n` +
  `\`/add dinner 1200\``;

export const QUICK_ADD_MISSING_AMOUNT_MESSAGE =
  `❌ *I need the amount too.*\n\n` +
  `Try:\n` +
  `\`Dinner 1200\``;

export const QUICK_ADD_INVALID_AMOUNT_MESSAGE =
  `❌ *Invalid amount.*\n\n` +
  `Example:\n` +
  `\`Dinner 1200\``;

export const QUICK_ADD_MISSING_DESCRIPTION_MESSAGE =
  `❌ *Add a description.*\n\n` +
  `*Example:*\n` +
  `\`Dinner 1200\``;

export const QUICK_ADD_MALFORMED_MESSAGE =
  `❌ *I couldn't understand that expense.*\n\n` +
  `Use:\n` +
  `\`<description> <amount>\`\n\n` +
  `*Example:*\n` +
  `\`Dinner 1200\``;

export const CHANGE_MENU_PROMPT = `✏️ *What would you like to change?*`;

export const NEW_DESCRIPTION_PROMPT =
  `📝 *Enter the new description:*\n\n` +
  `_Example: Dinner with team_`;

export const NEW_AMOUNT_PROMPT =
  `💰 *Enter the new amount:*\n\n` +
  `_Example: 1200 or 1200.50_`;

export const UNEXPECTED_INPUT_MESSAGE =
  `ℹ️ *Please use the buttons above to proceed.*`;

export function formatQuickRupees(paise: number): string {
  const rupees = paise / 100;
  const hasDecimals = paise % 100 !== 0;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPayerPrompt(amountPaise: number): string {
  return `👤 *Who paid ${formatQuickRupees(amountPaise)}?*`;
}

export function formatParticipantsPrompt(description: string, amountPaise: number): string {
  return (
    `👥 *Who shared this expense?*\n\n` +
    `*${escapeMarkdown(description)}* — ${formatQuickRupees(amountPaise)}\n\n` +
    `_Select who shared this expense:_`
  );
}

export function formatSplitTypePrompt(amountPaise: number): string {
  return `⚖️ *How should ${formatQuickRupees(amountPaise)} be split?*`;
}

export const EXPENSE_SHARES_PROMPT =
  `🔢 *Give each person their number of shares.*\n\n` +
  `_Tap ➖ or ➕ to adjust shares for each participant:_`;

export function formatExpenseConfirmation(draft: ExpenseDraft): string {
  const typeLabel =
    draft.splitType === 'equal'
      ? 'Equal'
      : draft.splitType === 'custom'
      ? 'Custom'
      : draft.splitType === 'percentage'
      ? 'Percentage'
      : 'Shares';

  const payerDisplay =
    draft.payerUserId === draft.creatorUserId
      ? 'You'
      : escapeMarkdown(draft.payerName?.replace(/\s*\(You\)$/, '') || 'Member');

  const count = draft.participantUserIds.length;
  const participantCountStr = `${count} ${count === 1 ? 'member' : 'members'}`;

  let splitDetails = '';
  if (draft.splitType && draft.splitType !== 'equal' && draft.splits.length > 0) {
    const lines = draft.splits
      .map((s) => {
        let extra = '';
        if (s.shares !== null && s.shares !== undefined) {
          extra = ` (${s.shares} ${s.shares === 1 ? 'share' : 'shares'})`;
        } else if (s.percentage !== null && s.percentage !== undefined) {
          extra = ` (${s.percentage}%)`;
        }
        return `• ${escapeMarkdown(s.name || 'Member')} — ${formatPaise(s.amount)}${extra}`;
      })
      .join('\n');
    splitDetails = `\n\n*Split breakdown:*\n${lines}`;
  }

  return (
    `🍽️ *${escapeMarkdown(draft.description || 'Expense')}*\n` +
    `💰 *${formatQuickRupees(draft.totalAmount || 0)}*\n` +
    `👤 *Paid by:* ${payerDisplay}\n` +
    `👥 *Split:* ${typeLabel}\n` +
    `👥 *Participants:* ${participantCountStr}` +
    splitDetails
  );
}

export function formatExpenseSuccess(
  description: string,
  amountPaise: number,
  payerName: string
): string {
  return (
    `✅ *Expense added!*\n\n` +
    `*${escapeMarkdown(description)}* — ${formatQuickRupees(amountPaise)}\n` +
    `👤 *Paid by ${escapeMarkdown(payerName)}*\n\n` +
    `_Group balances have been updated._`
  );
}
