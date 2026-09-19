/**
 * Settlements Module
 *
 * Encapsulates debt simplification, balance calculations, and repayment records.
 */

export type SettlementStatus = 'pending' | 'paid' | 'cancelled';

export interface Settlement {
  id: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amount: number; // Stored in minor units (paise)
  currency: string;
  status: SettlementStatus;
  createdBy: string;
  settledAt?: Date | null;
  createdAt: Date;
}

export interface Balance {
  userId: string;
  amount: number; // Minor units: positive = owed money, negative = owes money
}

export interface Debt {
  fromUserId: string;
  toUserId: string;
  amount: number; // Minor units (paise)
}
