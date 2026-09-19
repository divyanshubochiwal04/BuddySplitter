import { formatPaise } from '../../shared/currency';
import { ExpenseDetailsResult, ExpenseHistoryResult } from '../../modules/expenses/expense.types';

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

function formatSplitType(splitType: string): string {
  switch (splitType) {
    case 'equal':
      return '⚖️ Equal';
    case 'custom':
      return '💰 Custom';
    case 'percentage':
      return '📊 Percentage';
    case 'shares':
      return '🔢 Shares';
    default:
      return splitType;
  }
}

export function formatExpenseHistoryMessage(
  result: ExpenseHistoryResult,
  groupTitle?: string
): string {
  const header = groupTitle ? `📋 *Expenses for ${groupTitle}*` : `📋 *Group Expenses*`;

  if (result.totalCount === 0) {
    return (
      `${header}\n\n` +
      `No active expenses recorded in this group yet.\n` +
      `Use /add or tap below to record your first expense!`
    );
  }

  const lines = result.expenses.map((e, idx) => {
    const index = (result.page - 1) * result.pageSize + idx + 1;
    return (
      `${index}. *${e.description}* — ${formatPaise(e.totalAmount)}\n` +
      `   Paid by ${e.payerName} • ${formatDate(e.expenseDate)}`
    );
  });

  return (
    `${header}\n` +
    `_Page ${result.page} of ${result.totalPages} (${result.totalCount} active)_\n\n` +
    `${lines.join('\n\n')}\n\n` +
    `_Select an expense below to view details, edit, or delete:_`
  );
}

export function formatExpenseDetailsMessage(details: ExpenseDetailsResult): string {
  const splitLines = details.splits.map((s) => {
    let extra = '';
    if (s.shares !== null && s.shares !== undefined) {
      extra = ` (${s.shares} ${s.shares === 1 ? 'share' : 'shares'})`;
    } else if (s.percentage !== null && s.percentage !== undefined) {
      extra = ` (${s.percentage}%)`;
    }
    return `• ${s.displayName}: ${formatPaise(s.amount)}${extra}`;
  });

  return (
    `🧾 *Expense Details*\n\n` +
    `*Description:* ${details.description}\n` +
    `*Total Amount:* ${formatPaise(details.totalAmount)}\n` +
    `*Paid by:* ${details.payerName}\n` +
    `*Created by:* ${details.creatorName}\n` +
    `*Date:* ${formatDateTime(details.expenseDate)}\n` +
    `*Split Method:* ${formatSplitType(details.splitType)}\n\n` +
    `*Participants & Breakdown:*\n` +
    `${splitLines.join('\n')}`
  );
}

export function formatDeleteConfirmationMessage(details: ExpenseDetailsResult): string {
  return (
    `⚠️ *Delete this expense?*\n\n` +
    `*${details.description}*\n` +
    `${formatPaise(details.totalAmount)}\n` +
    `Paid by ${details.payerName}\n\n` +
    `This will remove it from active expense history and recalculate balances.`
  );
}

export function formatExpenseDeletedSuccessMessage(
  description: string,
  totalAmount: number
): string {
  return (
    `✅ Expense "*${description}*" (${formatPaise(totalAmount)}) has been deleted.\n\n` +
    `Group balances and settlement recommendations have been updated.`
  );
}
