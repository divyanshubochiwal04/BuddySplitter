import { ValidationError } from '../../shared/errors';
import { ExpenseWithSplits } from '../../db/repositories/expenses.repository';
import {
  BalanceCategory,
  GroupBalanceSummary,
  MemberBalance,
} from './balance.types';

export interface MemberIdentity {
  userId: string;
  displayName: string;
}

/**
 * Pure domain balance calculator.
 *
 * Mathematical Core:
 *   For every member M:
 *     paidAmount = sum(expense.total_amount) for all active expenses where expense.paid_by === M.userId
 *     owedAmount = sum(split.amount) for all splits where split.user_id === M.userId
 *     netBalance = paidAmount - owedAmount
 *
 * Conservation Invariant:
 *   SUM(all member.paidAmount) === SUM(all member.owedAmount) === totalExpensesAmount
 *   SUM(all member.netBalance) === 0
 *
 * Category Classification:
 *   netBalance > 0  --> 'creditor' (should receive money)
 *   netBalance < 0  --> 'debtor'   (owes money)
 *   netBalance == 0 --> 'settled'  (settled up)
 */
export function calculateGroupBalances(
  groupId: string,
  members: MemberIdentity[],
  expenses: ExpenseWithSplits[]
): GroupBalanceSummary {
  // 1. Filter only active (non-deleted) expenses
  const activeExpenses = expenses.filter((e) => !e.deleted_at);

  // 2. Validate expense split integrity invariants
  for (const expense of activeExpenses) {
    const splitSum = (expense.splits || []).reduce((sum, s) => sum + s.amount, 0);
    if (splitSum !== expense.total_amount) {
      throw new ValidationError(
        `Expense split sum mismatch for "${expense.description}" (ID: ${expense.id}): splits total ${splitSum} paise, expected ${expense.total_amount} paise`
      );
    }
  }

  // 3. Initialize member balance records
  const memberMap = new Map<
    string,
    { displayName: string; paidAmount: number; owedAmount: number }
  >();

  for (const m of members) {
    memberMap.set(m.userId, {
      displayName: m.displayName || 'Member',
      paidAmount: 0,
      owedAmount: 0,
    });
  }

  // 4. Aggregate paid amounts and owed amounts from active expenses and splits
  let totalExpensesAmount = 0;

  for (const expense of activeExpenses) {
    totalExpensesAmount += expense.total_amount;

    // Credit payer with full total_amount
    const payerRecord = memberMap.get(expense.paid_by);
    if (payerRecord) {
      payerRecord.paidAmount += expense.total_amount;
    } else {
      // Payer is not in active member list; register them to preserve balance conservation
      memberMap.set(expense.paid_by, {
        displayName: 'Payer',
        paidAmount: expense.total_amount,
        owedAmount: 0,
      });
    }

    // Debit each participant by split amount
    for (const split of expense.splits || []) {
      const participantRecord = memberMap.get(split.user_id);
      if (participantRecord) {
        participantRecord.owedAmount += split.amount;
      } else {
        memberMap.set(split.user_id, {
          displayName: 'Participant',
          paidAmount: 0,
          owedAmount: split.amount,
        });
      }
    }
  }

  // 5. Compute net balances and classify members
  const memberBalances: MemberBalance[] = [];
  let totalNetCheck = 0;

  for (const [userId, data] of memberMap.entries()) {
    const netBalance = data.paidAmount - data.owedAmount;
    totalNetCheck += netBalance;

    let category: BalanceCategory;
    if (netBalance > 0) {
      category = 'creditor';
    } else if (netBalance < 0) {
      category = 'debtor';
    } else {
      category = 'settled';
    }

    memberBalances.push({
      userId,
      displayName: data.displayName,
      paidAmount: data.paidAmount,
      owedAmount: data.owedAmount,
      netBalance,
      category,
    });
  }

  // 6. Conservation Invariant Validation
  if (totalNetCheck !== 0) {
    throw new ValidationError(
      `Balance conservation invariant failed: sum of all net balances is ${totalNetCheck} paise (must be exactly 0)`
    );
  }

  // 7. Deterministic Sorting
  // Creditors: descending by netBalance, tie-break alphabetically by displayName
  const creditors = memberBalances
    .filter((m) => m.category === 'creditor')
    .sort((a, b) => {
      if (b.netBalance !== a.netBalance) {
        return b.netBalance - a.netBalance;
      }
      return a.displayName.localeCompare(b.displayName);
    });

  // Debtors: ascending by netBalance (most negative first), tie-break alphabetically by displayName
  const debtors = memberBalances
    .filter((m) => m.category === 'debtor')
    .sort((a, b) => {
      if (a.netBalance !== b.netBalance) {
        return a.netBalance - b.netBalance;
      }
      return a.displayName.localeCompare(b.displayName);
    });

  // Settled: alphabetically by displayName
  const settled = memberBalances
    .filter((m) => m.category === 'settled')
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const allBalances = [...creditors, ...debtors, ...settled];

  return {
    groupId,
    totalExpensesCount: activeExpenses.length,
    totalExpensesAmount,
    creditors,
    debtors,
    settled,
    allBalances,
  };
}
