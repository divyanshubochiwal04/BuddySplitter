import { formatPaise } from '../../shared/currency';
import { GroupBalanceSummary, UserPersonalBalance } from './balance.types';

/**
 * Formats a user's personal balance for display in Telegram.
 */
export function formatUserPersonalBalance(balance: UserPersonalBalance): string {
  let statusHeader = '';
  let netSign = '';

  if (balance.category === 'creditor') {
    statusHeader = `🟢 *You should receive:* ${formatPaise(balance.netBalance)}`;
    netSign = '+';
  } else if (balance.category === 'debtor') {
    statusHeader = `🔴 *You owe:* ${formatPaise(Math.abs(balance.netBalance))}`;
    netSign = '-';
  } else {
    statusHeader = `⚪ *You're all settled up!*`;
    netSign = '';
  }

  const netFormatted =
    balance.netBalance === 0
      ? formatPaise(0)
      : `${netSign}${formatPaise(Math.abs(balance.netBalance))}`;

  return (
    `💰 *Your Balance*\n\n` +
    `${statusHeader}\n\n` +
    `• *Paid:* ${formatPaise(balance.paidAmount)}\n` +
    `• *Your share:* ${formatPaise(balance.owedAmount)}\n` +
    `• *Net:* ${netFormatted}`
  );
}

/**
 * Formats a full group's balance summary for display in Telegram.
 * Avoids any settlement instructions (deferred to Phase 7).
 */
export function formatGroupBalanceSummary(summary: GroupBalanceSummary): string {
  if (summary.totalExpensesCount === 0) {
    return (
      `📊 *Group Summary*\n\n` +
      `_No expenses recorded yet in this group._\n\n` +
      `Type /add to record the first expense!`
    );
  }

  const lines: string[] = [`📊 *Group Summary*\n`];

  // 1. Creditors (receive money)
  for (const creditor of summary.creditors) {
    lines.push(`🟢 ${creditor.displayName} receives ${formatPaise(creditor.netBalance)}`);
  }

  // 2. Debtors (owe money)
  for (const debtor of summary.debtors) {
    lines.push(`🔴 ${debtor.displayName} owes ${formatPaise(Math.abs(debtor.netBalance))}`);
  }

  // 3. Settled members (if any exist)
  if (summary.settled.length > 0) {
    lines.push('');
    lines.push(`⚪ *Settled:*`);
    for (const s of summary.settled) {
      lines.push(`• ${s.displayName}`);
    }
  }

  lines.push('');
  const expenseCountLabel =
    summary.totalExpensesCount === 1 ? '1 expense' : `${summary.totalExpensesCount} expenses`;
  lines.push(`💰 *Total expenses:* ${formatPaise(summary.totalExpensesAmount)} (${expenseCountLabel})`);

  return lines.join('\n');
}
