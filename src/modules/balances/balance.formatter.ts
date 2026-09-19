import { formatPaise } from '../../shared/currency';
import {
  GroupBalanceSummary,
  ReconciledGroupBalanceSummary,
  ReconciledUserPersonalBalance,
  UserPersonalBalance,
} from './balance.types';

/**
 * Formats a user's personal balance for display in Telegram.
 * Supports both raw UserPersonalBalance and ReconciledUserPersonalBalance.
 */
export function formatUserPersonalBalance(
  balance: UserPersonalBalance | ReconciledUserPersonalBalance
): string {
  const isReconciled = 'outstandingNet' in balance;
  const netAmount = isReconciled ? balance.outstandingNet : balance.netBalance;

  let statusHeader = '';
  let netSign = '';

  if (balance.category === 'creditor') {
    statusHeader = `🟢 *You should receive:* ${formatPaise(netAmount)}`;
    netSign = '+';
  } else if (balance.category === 'debtor') {
    statusHeader = `🔴 *You owe:* ${formatPaise(Math.abs(netAmount))}`;
    netSign = '-';
  } else {
    statusHeader = `⚪ *You're all settled up!*`;
    netSign = '';
  }

  const netFormatted =
    netAmount === 0
      ? formatPaise(0)
      : `${netSign}${formatPaise(Math.abs(netAmount))}`;

  if (isReconciled && (balance.paymentsMade > 0 || balance.paymentsReceived > 0)) {
    const rawSign = balance.rawBalance > 0 ? '+' : balance.rawBalance < 0 ? '-' : '';
    const rawFormatted =
      balance.rawBalance === 0
        ? formatPaise(0)
        : `${rawSign}${formatPaise(Math.abs(balance.rawBalance))}`;

    return (
      `💰 *Your Balance*\n\n` +
      `${statusHeader}\n\n` +
      `• *Paid:* ${formatPaise(balance.paidAmount)}\n` +
      `• *Your share:* ${formatPaise(balance.owedAmount)}\n` +
      `• *Expense net:* ${rawFormatted}\n` +
      `• *Payments made:* ${formatPaise(balance.paymentsMade)}\n` +
      `• *Payments received:* ${formatPaise(balance.paymentsReceived)}\n` +
      `• *Outstanding:* ${netFormatted}`
    );
  }

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
 * Supports both raw GroupBalanceSummary and ReconciledGroupBalanceSummary.
 */
export function formatGroupBalanceSummary(
  summary: GroupBalanceSummary | ReconciledGroupBalanceSummary
): string {
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
    const net = 'outstandingNet' in creditor ? creditor.outstandingNet : creditor.netBalance;
    lines.push(`🟢 ${creditor.displayName} receives ${formatPaise(net)}`);
  }

  // 2. Debtors (owe money)
  for (const debtor of summary.debtors) {
    const net = 'outstandingNet' in debtor ? debtor.outstandingNet : debtor.netBalance;
    lines.push(`🔴 ${debtor.displayName} owes ${formatPaise(Math.abs(net))}`);
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

  if ('totalPaymentsCount' in summary && summary.totalPaymentsCount > 0) {
    const paymentCountLabel =
      summary.totalPaymentsCount === 1 ? '1 payment' : `${summary.totalPaymentsCount} payments`;
    lines.push(`💸 *Total settled:* ${formatPaise(summary.totalPaymentsAmount)} (${paymentCountLabel})`);
  }

  return lines.join('\n');
}
