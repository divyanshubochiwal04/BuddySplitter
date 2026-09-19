import { SplitType } from './index';

export type ExpenseFlowStep =
  | 'AWAITING_DESCRIPTION'
  | 'AWAITING_AMOUNT'
  | 'AWAITING_PAYER'
  | 'AWAITING_PARTICIPANTS'
  | 'AWAITING_SPLIT_TYPE'
  | 'AWAITING_CUSTOM_SPLIT'
  | 'AWAITING_PERCENTAGE_SPLIT'
  | 'AWAITING_SHARES_SPLIT'
  | 'AWAITING_CONFIRMATION'
  | 'SAVING';

export interface SplitEntry {
  userId: string;
  name: string;
  amount: number; // minor units (paise)
  percentage?: number | null;
  shares?: number | null;
}

export interface ExpenseDraft {
  chatId: number;
  userId: number; // Telegram user ID of creator
  groupId: string; // Database group UUID
  creatorUserId: string; // Database user UUID of creator
  step: ExpenseFlowStep;
  description?: string;
  totalAmount?: number; // minor units (paise)
  payerUserId?: string; // Database user UUID
  payerName?: string;
  participantUserIds: string[]; // Database user UUIDs
  splitType?: SplitType;
  splits: SplitEntry[];
  customSplitIndex?: number; // Pointer for multi-step custom/percentage input
  sharesMap?: Record<string, number>; // Mapping participant userId -> number of shares
  editingExpenseId?: string; // Database expense UUID if in edit mode
  returnPage?: number; // Page number to return to upon completion/cancellation
  createdAt: number;
  updatedAt: number;
}

const DRAFT_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class ExpenseStateManager {
  private readonly drafts = new Map<string, ExpenseDraft>();

  private makeKey(chatId: number, userId: number): string {
    return `${chatId}:${userId}`;
  }

  private isExpired(draft: ExpenseDraft): boolean {
    return Date.now() - draft.updatedAt > DRAFT_TTL_MS;
  }

  getState(chatId: number, userId: number): ExpenseDraft | null {
    const key = this.makeKey(chatId, userId);
    const draft = this.drafts.get(key);

    if (!draft) return null;

    if (this.isExpired(draft)) {
      this.drafts.delete(key);
      return null;
    }

    return draft;
  }

  setState(draft: ExpenseDraft): void {
    const key = this.makeKey(draft.chatId, draft.userId);
    this.drafts.set(key, {
      ...draft,
      updatedAt: Date.now(),
    });
  }

  updateState(
    chatId: number,
    userId: number,
    updates: Partial<ExpenseDraft>
  ): ExpenseDraft | null {
    const current = this.getState(chatId, userId);
    if (!current) return null;

    const updated: ExpenseDraft = {
      ...current,
      ...updates,
      updatedAt: Date.now(),
    };

    this.drafts.set(this.makeKey(chatId, userId), updated);
    return updated;
  }

  clearState(chatId: number, userId: number): void {
    const key = this.makeKey(chatId, userId);
    this.drafts.delete(key);
  }

  // Prunes any expired drafts
  pruneExpired(): void {
    const now = Date.now();
    for (const [key, draft] of this.drafts.entries()) {
      if (now - draft.updatedAt > DRAFT_TTL_MS) {
        this.drafts.delete(key);
      }
    }
  }

  // For testing
  clearAll(): void {
    this.drafts.clear();
  }
}

export const expenseStateManager = new ExpenseStateManager();
