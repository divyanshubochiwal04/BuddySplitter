/**
 * Balance Engine Domain Types
 * All monetary amounts are in integer minor units (paise: ₹1 = 100 paise).
 */

export type BalanceCategory = 'creditor' | 'debtor' | 'settled';

export interface MemberBalance {
  userId: string;
  displayName: string;
  paidAmount: number; // minor units (paise)
  owedAmount: number; // minor units (paise)
  netBalance: number; // minor units (paise): paidAmount - owedAmount
  category: BalanceCategory;
}

export interface GroupBalanceSummary {
  groupId: string;
  totalExpensesCount: number;
  totalExpensesAmount: number; // minor units (paise)
  creditors: MemberBalance[];
  debtors: MemberBalance[];
  settled: MemberBalance[];
  allBalances: MemberBalance[];
}

export interface UserPersonalBalance {
  userId: string;
  displayName: string;
  paidAmount: number; // minor units (paise)
  owedAmount: number; // minor units (paise)
  netBalance: number; // minor units (paise)
  category: BalanceCategory;
}

export interface ReconciledMemberBalance {
  userId: string;
  displayName: string;
  paidAmount: number; // minor units (paise) from expenses
  owedAmount: number; // minor units (paise) from expenses
  rawBalance: number; // paidAmount - owedAmount
  paymentsMade: number; // sum of paid settlements as sender
  paymentsReceived: number; // sum of paid settlements as recipient
  outstandingNet: number; // rawBalance + paymentsMade - paymentsReceived
  category: BalanceCategory;
}

export interface ReconciledGroupBalanceSummary {
  groupId: string;
  totalExpensesCount: number;
  totalExpensesAmount: number; // minor units (paise)
  totalPaymentsCount: number;
  totalPaymentsAmount: number; // minor units (paise)
  creditors: ReconciledMemberBalance[];
  debtors: ReconciledMemberBalance[];
  settled: ReconciledMemberBalance[];
  allBalances: ReconciledMemberBalance[];
}

export interface ReconciledUserPersonalBalance {
  userId: string;
  displayName: string;
  paidAmount: number; // total expenses paid
  owedAmount: number; // total expense share
  rawBalance: number; // paidAmount - owedAmount
  paymentsMade: number; // settlements paid
  paymentsReceived: number; // settlements received
  outstandingNet: number; // rawBalance + paymentsMade - paymentsReceived
  category: BalanceCategory;
}

