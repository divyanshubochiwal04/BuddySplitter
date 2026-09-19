/**
 * Expenses Module
 *
 * Encapsulates expense tracking, split allocations, and validation.
 */

export type SplitType = 'equal' | 'custom' | 'percentage';

export interface ExpenseSplit {
  id: string;
  expenseId: string;
  userId: string;
  amount: number; // Stored in minor units (paise)
  percentage?: number | null;
  createdAt: Date;
}

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  category: string;
  totalAmount: number; // Stored in minor units (paise)
  currency: string;
  paidBy: string;
  createdBy: string;
  splitType: SplitType;
  expenseDate: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  splits?: ExpenseSplit[];
}

export * from './split';
export * from './expense-state';
export * from './expense-validation';
export * from './expense.service';
