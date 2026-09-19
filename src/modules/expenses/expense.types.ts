import { SplitType } from '../../db/types';

export interface ExpenseListItem {
  id: string;
  description: string;
  totalAmount: number; // paise
  currency: string;
  paidByUserId: string;
  payerName: string;
  expenseDate: string;
  createdAt: string;
}

export interface ExpenseHistoryResult {
  expenses: ExpenseListItem[];
  totalCount: number;
  page: number;
  totalPages: number;
  pageSize: number;
}

export interface ExpenseParticipantDetail {
  userId: string;
  displayName: string;
  amount: number; // paise
  percentage: number | null;
  shares: number | null;
}

export interface ExpenseDetailsResult {
  id: string;
  groupId: string;
  description: string;
  totalAmount: number; // paise
  currency: string;
  paidByUserId: string;
  payerName: string;
  createdByUserId: string;
  creatorName: string;
  splitType: SplitType;
  expenseDate: string;
  createdAt: string;
  splits: ExpenseParticipantDetail[];
  canManage: boolean;
  hasRepayments: boolean;
}
