import { ValidationError } from '../../shared/errors';
import { SettlementRow } from '../../db/types';
import {
  BalanceCategory,
  GroupBalanceSummary,
  MemberBalance,
  ReconciledGroupBalanceSummary,
  ReconciledMemberBalance,
} from './balance.types';

/**
 * Reconciles raw expense balances with recorded paid repayments.
 *
 * Mathematical Core:
 *   For every member M:
 *     rawBalance = paidAmount - owedAmount
 *     paymentsMade = sum(settlement.amount) where settlement.from_user_id === M.userId && settlement.status === 'paid'
 *     paymentsReceived = sum(settlement.amount) where settlement.to_user_id === M.userId && settlement.status === 'paid'
 *     outstandingNet = rawBalance + paymentsMade - paymentsReceived
 *
 * Conservation Invariant:
 *   Since SUM(rawBalance) === 0 and every paid settlement contributes +amount to paymentsMade of sender
 *   and +amount to paymentsReceived of recipient, SUM(paymentsMade - paymentsReceived) === 0.
 *   Therefore: SUM(outstandingNet) === 0.
 *
 * Category Classification:
 *   outstandingNet > 0  --> 'creditor' (still needs to receive money)
 *   outstandingNet < 0  --> 'debtor'   (still owes money)
 *   outstandingNet == 0 --> 'settled'  (all settled up)
 */
export function reconcileBalances(
  rawSummary: GroupBalanceSummary,
  settlements: SettlementRow[]
): ReconciledGroupBalanceSummary {
  // 1. Filter only 'paid' settlements
  const paidSettlements = settlements.filter((s) => s.status === 'paid');

  // 2. Initialize member map from raw balances
  const memberMap = new Map<
    string,
    {
      displayName: string;
      paidAmount: number;
      owedAmount: number;
      rawBalance: number;
      paymentsMade: number;
      paymentsReceived: number;
    }
  >();

  for (const mb of rawSummary.allBalances) {
    memberMap.set(mb.userId, {
      displayName: mb.displayName,
      paidAmount: mb.paidAmount,
      owedAmount: mb.owedAmount,
      rawBalance: mb.netBalance,
      paymentsMade: 0,
      paymentsReceived: 0,
    });
  }

  // 3. Aggregate payments made and received
  let totalPaymentsAmount = 0;

  for (const s of paidSettlements) {
    totalPaymentsAmount += s.amount;

    // Sender paid money -> increases their net standing (moves negative debt towards 0)
    const sender = memberMap.get(s.from_user_id);
    if (sender) {
      sender.paymentsMade += s.amount;
    } else {
      memberMap.set(s.from_user_id, {
        displayName: 'Member',
        paidAmount: 0,
        owedAmount: 0,
        rawBalance: 0,
        paymentsMade: s.amount,
        paymentsReceived: 0,
      });
    }

    // Recipient received money -> decreases their net standing (moves positive credit towards 0)
    const recipient = memberMap.get(s.to_user_id);
    if (recipient) {
      recipient.paymentsReceived += s.amount;
    } else {
      memberMap.set(s.to_user_id, {
        displayName: 'Member',
        paidAmount: 0,
        owedAmount: 0,
        rawBalance: 0,
        paymentsMade: 0,
        paymentsReceived: s.amount,
      });
    }
  }

  // 4. Calculate outstanding net balances and validate conservation
  const reconciledBalances: ReconciledMemberBalance[] = [];
  let totalOutstandingCheck = 0;

  for (const [userId, data] of memberMap.entries()) {
    const outstandingNet = data.rawBalance + data.paymentsMade - data.paymentsReceived;
    totalOutstandingCheck += outstandingNet;

    let category: BalanceCategory;
    if (outstandingNet > 0) {
      category = 'creditor';
    } else if (outstandingNet < 0) {
      category = 'debtor';
    } else {
      category = 'settled';
    }

    reconciledBalances.push({
      userId,
      displayName: data.displayName,
      paidAmount: data.paidAmount,
      owedAmount: data.owedAmount,
      rawBalance: data.rawBalance,
      paymentsMade: data.paymentsMade,
      paymentsReceived: data.paymentsReceived,
      outstandingNet,
      category,
    });
  }

  if (totalOutstandingCheck !== 0) {
    throw new ValidationError(
      `Reconciled balance conservation invariant failed: sum of all outstanding net balances is ${totalOutstandingCheck} paise (must be exactly 0)`
    );
  }

  // 5. Deterministic sorting
  // Creditors: descending by outstandingNet, tie-break by displayName
  const creditors = reconciledBalances
    .filter((m) => m.category === 'creditor')
    .sort((a, b) => {
      if (b.outstandingNet !== a.outstandingNet) {
        return b.outstandingNet - a.outstandingNet;
      }
      return a.displayName.localeCompare(b.displayName);
    });

  // Debtors: ascending by outstandingNet (most negative first), tie-break by displayName
  const debtors = reconciledBalances
    .filter((m) => m.category === 'debtor')
    .sort((a, b) => {
      if (a.outstandingNet !== b.outstandingNet) {
        return a.outstandingNet - b.outstandingNet;
      }
      return a.displayName.localeCompare(b.displayName);
    });

  // Settled: alphabetically by displayName
  const settled = reconciledBalances
    .filter((m) => m.category === 'settled')
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const allBalances = [...creditors, ...debtors, ...settled];

  return {
    groupId: rawSummary.groupId,
    totalExpensesCount: rawSummary.totalExpensesCount,
    totalExpensesAmount: rawSummary.totalExpensesAmount,
    totalPaymentsCount: paidSettlements.length,
    totalPaymentsAmount,
    creditors,
    debtors,
    settled,
    allBalances,
  };
}

/**
 * Adapts ReconciledGroupBalanceSummary into MemberBalance[]
 * with netBalance equal to outstandingNet so it can be passed directly
 * into Phase 7 calculateSettlements.
 */
export function reconciledToMemberBalances(
  reconciled: ReconciledGroupBalanceSummary
): MemberBalance[] {
  return reconciled.allBalances.map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
    paidAmount: m.paidAmount,
    owedAmount: m.owedAmount,
    netBalance: m.outstandingNet,
    category: m.category,
  }));
}
