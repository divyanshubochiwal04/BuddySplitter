import { formatPaise } from '../../shared/currency';
import { GroupSettlementPlan, UserSettlementSummary } from './settlement.types';

/**
 * Formats a user's personal settlement actions for Telegram.
 */
export function formatUserSettlementSummary(summary: UserSettlementSummary): string {
  if (summary.isSettled) {
    return (
      `💸 *Your Settlements*\n\n` +
      `⚪ *You're all settled up!*\n` +
      `No payments or receivables needed.`
    );
  }

  const sections: string[] = [`💸 *Your Settlements*\n`];

  // 1. Debts user needs to pay others
  if (summary.payments.length > 0) {
    sections.push(`🔴 *You pay:*`);
    for (const tx of summary.payments) {
      sections.push(`• ${tx.toDisplayName} — ${formatPaise(tx.amount)}`);
    }
  }

  // 2. Credits user should receive from others
  if (summary.receivables.length > 0) {
    if (summary.payments.length > 0) {
      sections.push('');
    }
    sections.push(`🟢 *You receive:*`);
    for (const tx of summary.receivables) {
      sections.push(`• ${tx.fromDisplayName} — ${formatPaise(tx.amount)}`);
    }
  }

  return sections.join('\n');
}

/**
 * Formats the full group settlement plan for Telegram.
 */
export function formatGroupSettlementPlan(plan: GroupSettlementPlan): string {
  if (plan.isSettled || plan.transactions.length === 0) {
    return (
      `💸 *Group Settlement Plan*\n\n` +
      `⚪ *All settled up!*\n` +
      `Everyone in this group is even. No payments needed.`
    );
  }

  const lines: string[] = [
    `💸 *Group Settlement Plan*\n`,
    `🔴 *Recommended Payments:*`,
  ];

  for (const tx of plan.transactions) {
    lines.push(`• ${tx.fromDisplayName} → ${tx.toDisplayName} ${formatPaise(tx.amount)}`);
  }

  lines.push('');
  lines.push(`💰 *Total to settle:* ${formatPaise(plan.totalAmount)}`);
  const paymentLabel = plan.totalPaymentsCount === 1 ? '1 payment' : `${plan.totalPaymentsCount} payments`;
  lines.push(`🔄 *Payments:* ${paymentLabel}`);
  lines.push('');
  lines.push(`_This is a recommendation only. Payments are not recorded until marked as paid._`);

  return lines.join('\n');
}
