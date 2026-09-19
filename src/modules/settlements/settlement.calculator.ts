import { ValidationError } from '../../shared/errors';
import { MemberBalance } from '../balances/balance.types';
import {
  GroupSettlementPlan,
  SettlementTransaction,
  UserSettlementSummary,
} from './settlement.types';

/**
 * Pure Settlement Calculator
 *
 * Algorithm: Greedy Bipartite Debtor-Creditor Matching
 *
 * Mathematical Guarantee:
 *   - For N unbalanced participants (D debtors + C creditors), this algorithm produces
 *     at most N - 1 transactions.
 *   - Each transaction completely satisfies at least one participant (reducing their remaining debt
 *     or credit to 0).
 *   - Globally optimal graph transaction minimization (finding the absolute minimum number of
 *     transactions) is isomorphic to the NP-hard Subset Sum / Multi-way Partition problem.
 *     This greedy algorithm provides an efficient O(N log N) deterministic heuristic that yields
 *     minimal or near-minimal transactions without exponential complexity, while guaranteeing
 *     exact conservation of money and zero float drift.
 *
 * Deterministic Sorting Rules:
 *   - Creditors: Descending by positive credit amount (largest credit first);
 *     tie-break by userId lexical comparison (localeCompare).
 *   - Debtors: Descending by payable debt amount (largest debt first);
 *     tie-break by userId lexical comparison (localeCompare).
 *
 * Invariants:
 *   - amount > 0 for every transaction.
 *   - fromUserId !== toUserId (zero self-payments).
 *   - SUM(all transaction amounts) === SUM(all positive balances) === SUM(all negative balance absolute values).
 *   - After applying all transactions, every participant's remaining balance is exactly 0 paise.
 */
export function calculateSettlements(
  groupId: string,
  balances: MemberBalance[]
): GroupSettlementPlan {
  // 1. Initial conservation audit on incoming balance vector
  let inputSumCheck = 0;
  for (const b of balances) {
    inputSumCheck += b.netBalance;
  }
  if (inputSumCheck !== 0) {
    throw new ValidationError(
      `Cannot calculate settlements: balance conservation invariant failed on input (sum is ${inputSumCheck} paise, expected 0)`
    );
  }

  // 2. Separate creditors and debtors
  const creditors = balances
    .filter((b) => b.netBalance > 0)
    .map((b) => ({
      userId: b.userId,
      displayName: b.displayName,
      remainingCredit: b.netBalance,
    }));

  const debtors = balances
    .filter((b) => b.netBalance < 0)
    .map((b) => ({
      userId: b.userId,
      displayName: b.displayName,
      remainingDebt: Math.abs(b.netBalance),
    }));

  // 3. Already balanced group (no creditors or debtors)
  if (creditors.length === 0 && debtors.length === 0) {
    return {
      groupId,
      transactions: [],
      totalAmount: 0,
      totalPaymentsCount: 0,
      isSettled: true,
    };
  }

  // 4. Deterministic sorting
  // Creditors: descending by credit amount, tie-break alphabetically by userId
  creditors.sort((a, b) => {
    if (b.remainingCredit !== a.remainingCredit) {
      return b.remainingCredit - a.remainingCredit;
    }
    return a.userId.localeCompare(b.userId);
  });

  // Debtors: descending by debt amount, tie-break alphabetically by userId
  debtors.sort((a, b) => {
    if (b.remainingDebt !== a.remainingDebt) {
      return b.remainingDebt - a.remainingDebt;
    }
    return a.userId.localeCompare(b.userId);
  });

  // 5. Greedy matching loop
  const transactions: SettlementTransaction[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    // Self-payment guard
    if (debtor.userId === creditor.userId) {
      throw new ValidationError(
        `Self-payment detected in settlement matching: user ${debtor.userId} cannot settle with themselves`
      );
    }

    const transferAmount = Math.min(debtor.remainingDebt, creditor.remainingCredit);

    if (transferAmount > 0) {
      transactions.push({
        fromUserId: debtor.userId,
        fromDisplayName: debtor.displayName,
        toUserId: creditor.userId,
        toDisplayName: creditor.displayName,
        amount: transferAmount,
      });

      debtor.remainingDebt -= transferAmount;
      creditor.remainingCredit -= transferAmount;
    }

    if (debtor.remainingDebt === 0) {
      dIdx++;
    }
    if (creditor.remainingCredit === 0) {
      cIdx++;
    }
  }

  // 6. Post-Condition Conservation Invariant Audits
  for (const d of debtors) {
    if (d.remainingDebt !== 0) {
      throw new ValidationError(
        `Settlement conservation failed: debtor ${d.userId} has ${d.remainingDebt} paise unsettled`
      );
    }
  }

  for (const c of creditors) {
    if (c.remainingCredit !== 0) {
      throw new ValidationError(
        `Settlement conservation failed: creditor ${c.userId} has ${c.remainingCredit} paise uncollected`
      );
    }
  }

  const totalSettlementAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);

  // Simulation audit: applying transactions against original balances must yield exactly 0 for everyone
  const simBalanceMap = new Map<string, number>();
  for (const b of balances) {
    simBalanceMap.set(b.userId, b.netBalance);
  }

  for (const tx of transactions) {
    const fromBal = simBalanceMap.get(tx.fromUserId) ?? 0;
    const toBal = simBalanceMap.get(tx.toUserId) ?? 0;
    simBalanceMap.set(tx.fromUserId, fromBal + tx.amount); // paying debt brings negative balance towards 0
    simBalanceMap.set(tx.toUserId, toBal - tx.amount); // receiving credit brings positive balance towards 0
  }

  for (const [userId, remaining] of simBalanceMap.entries()) {
    if (remaining !== 0) {
      throw new ValidationError(
        `Settlement invariant failed: user ${userId} has residual balance of ${remaining} paise after simulated settlements`
      );
    }
  }

  return {
    groupId,
    transactions,
    totalAmount: totalSettlementAmount,
    totalPaymentsCount: transactions.length,
    isSettled: transactions.length === 0,
  };
}

/**
 * Derives a specific user's personal settlement summary from a full group settlement plan.
 */
export function calculateUserSettlementSummary(
  userId: string,
  displayName: string,
  plan: GroupSettlementPlan
): UserSettlementSummary {
  const payments = plan.transactions.filter((tx) => tx.fromUserId === userId);
  const receivables = plan.transactions.filter((tx) => tx.toUserId === userId);

  const totalToPay = payments.reduce((sum, tx) => sum + tx.amount, 0);
  const totalToReceive = receivables.reduce((sum, tx) => sum + tx.amount, 0);
  const netBalance = totalToReceive - totalToPay;
  const isSettled = payments.length === 0 && receivables.length === 0;

  return {
    userId,
    displayName,
    payments,
    receivables,
    totalToPay,
    totalToReceive,
    netBalance,
    isSettled,
  };
}
