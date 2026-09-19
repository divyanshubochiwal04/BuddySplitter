/**
 * Settlements Module
 *
 * Encapsulates debt simplification, balance calculations, and settlement recommendations.
 */

export * from './settlement.types';
export * from './settlement.calculator';
export * from './settlement.formatter';
export * from './settlement.service';

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
