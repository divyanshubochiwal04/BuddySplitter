import { formatPaise } from '../../shared/currency';
import { escapeMarkdown } from '../../shared/markdown';
import {
  RepayAllocation,
  RepayCalculationResult,
  RepayDebtItem,
} from '../../modules/settlements/repay-calculator';

export function formatRepaySelectionMessage(
  targetAmount: number,
  debts: RepayDebtItem[],
  calcResult: RepayCalculationResult
): string {
  const lines: string[] = [`💸 *Repay ${formatPaise(targetAmount)}*\n`];

  if (debts.length === 1) {
    lines.push(`Select transaction to repay:\n`);
  } else {
    lines.push(`Select which transaction(s) to repay (multi-select):\n`);
  }

  if (calcResult.allocations.length > 0) {
    lines.push(`*Repayment Breakdown:*`);
    for (const alloc of calcResult.allocations) {
      if (alloc.allocatedAmount === 0) {
        lines.push(
          `• *${escapeMarkdown(alloc.toDisplayName)}*: ₹0 _(Amount exhausted, debt: ${formatPaise(alloc.originalDebt)})_`
        );
      } else if (alloc.isFull) {
        lines.push(
          `• *${escapeMarkdown(alloc.toDisplayName)}*: Paying *${formatPaise(alloc.allocatedAmount)}* (Fully Settled 🎉)`
        );
      } else {
        lines.push(
          `• *${escapeMarkdown(alloc.toDisplayName)}*: Paying *${formatPaise(alloc.allocatedAmount)}* (Remaining debt: *${formatPaise(alloc.remainingDebt)}*)`
        );
      }
    }
    lines.push('');
    lines.push(`*Total Repaying:* ${formatPaise(calcResult.totalAllocated)}`);

    if (calcResult.unallocatedAmount > 0) {
      lines.push(`_Remaining to allocate: ${formatPaise(calcResult.unallocatedAmount)}_`);
    }
  } else {
    lines.push(`_Tap the debt(s) below to allocate your ${formatPaise(targetAmount)}._`);
  }

  return lines.join('\n');
}

export function formatRepaySuccessMessage(
  allocations: RepayAllocation[],
  totalRepaid: number
): string {
  const lines: string[] = [`✅ *Repayment Successful!*\n`];

  for (const alloc of allocations) {
    if (alloc.allocatedAmount <= 0) continue;
    if (alloc.isFull) {
      lines.push(
        `• Paid *${escapeMarkdown(alloc.toDisplayName)}* *${formatPaise(alloc.allocatedAmount)}* (Fully Settled 🎉)`
      );
    } else {
      lines.push(
        `• Paid *${escapeMarkdown(alloc.toDisplayName)}* *${formatPaise(alloc.allocatedAmount)}* (Remaining debt: *${formatPaise(alloc.remainingDebt)}*)`
      );
    }
  }

  lines.push('');
  lines.push(`*Total Repaid:* ${formatPaise(totalRepaid)}`);
  lines.push(`Group balances and settlements have been updated.`);

  return lines.join('\n');
}

export function formatRepayNoAmountMessage(debts: RepayDebtItem[]): string {
  const totalDebt = debts.reduce((sum, d) => sum + d.debtAmount, 0);
  const lines: string[] = [
    `💸 *Repay Debts*\n`,
    `Your current outstanding debts:`,
  ];

  for (const d of debts) {
    lines.push(`• *${escapeMarkdown(d.toDisplayName)}*: ${formatPaise(d.debtAmount)}`);
  }

  lines.push('');
  lines.push(`*Total Debt:* ${formatPaise(totalDebt)}\n`);
  lines.push(`💡 *Quick tip:* Type \`/repay <amount>\` (e.g. \`/repay 450\`) to allocate & repay instantly.`);
  lines.push(`Or choose a settlement below to pay in full:`);

  return lines.join('\n');
}
