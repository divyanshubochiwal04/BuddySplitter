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
