/**
 * Settlement Engine Domain Types
 * All monetary amounts are in integer minor units (paise: ₹1 = 100 paise).
 */

export interface SettlementTransaction {
  fromUserId: string;
  fromDisplayName: string;
  toUserId: string;
  toDisplayName: string;
  amount: number; // minor units (paise), strictly > 0
}

export interface GroupSettlementPlan {
  groupId: string;
  transactions: SettlementTransaction[];
  totalAmount: number; // minor units (paise)
  totalPaymentsCount: number;
  isSettled: boolean;
}

export interface UserSettlementSummary {
  userId: string;
  displayName: string;
  payments: SettlementTransaction[];
  receivables: SettlementTransaction[];
  totalToPay: number; // minor units (paise)
  totalToReceive: number; // minor units (paise)
  netBalance: number; // minor units (paise): totalToReceive - totalToPay
  isSettled: boolean;
}

export interface RecordPaymentParams {
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amount: number; // minor units (paise), strictly > 0
  createdBy: string;
  currency?: string;
}

export interface PaymentHistoryItem {
  id: string;
  fromUserId: string;
  fromDisplayName: string;
  toUserId: string;
  toDisplayName: string;
  amount: number; // minor units (paise)
  currency: string;
  settledAt: string;
  createdAt: string;
}

