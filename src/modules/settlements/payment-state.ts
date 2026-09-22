import { RepayDebtItem } from './repay-calculator';

export type PaymentFlowStep =
  | 'AWAITING_RECIPIENT'
  | 'AWAITING_AMOUNT_CHOICE'
  | 'AWAITING_CUSTOM_AMOUNT'
  | 'AWAITING_CONFIRMATION'
  | 'AWAITING_REPAY_SELECTION'
  | 'SAVING';

export interface PaymentDraft {
  chatId: number;
  userId: number; // Telegram user ID of payer
  groupId: string; // Database group UUID
  payerUserId: string; // Database user UUID of payer
  payerDisplayName: string;
  recipientUserId?: string; // Database user UUID of recipient
  recipientDisplayName?: string;
  maxAmount?: number; // minor units (paise) of maximum debt owed to this recipient
  amount?: number; // minor units (paise) to pay
  currency?: string;
  step: PaymentFlowStep;
  createdAt: number;
  updatedAt: number;
  // Fields for /repay multi-select allocation flow
  repayTargetAmount?: number; // minor units (paise)
  repayDebts?: RepayDebtItem[];
  selectedRecipientIds?: string[];
}

const DRAFT_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class PaymentStateManager {
  private readonly drafts = new Map<string, PaymentDraft>();

  private makeKey(chatId: number, userId: number): string {
    return `${chatId}:${userId}`;
  }

  private isExpired(draft: PaymentDraft): boolean {
    return Date.now() - draft.updatedAt > DRAFT_TTL_MS;
  }

  getState(chatId: number, userId: number): PaymentDraft | null {
    const key = this.makeKey(chatId, userId);
    const draft = this.drafts.get(key);

    if (!draft) return null;

    if (this.isExpired(draft)) {
      this.drafts.delete(key);
      return null;
    }

    return draft;
  }

  setState(draft: PaymentDraft): void {
    const key = this.makeKey(draft.chatId, draft.userId);
    this.drafts.set(key, {
      ...draft,
      updatedAt: Date.now(),
    });
  }

  updateState(
    chatId: number,
    userId: number,
    updates: Partial<PaymentDraft>
  ): PaymentDraft | null {
    const current = this.getState(chatId, userId);
    if (!current) return null;

    const updated: PaymentDraft = {
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

  isUserRecordingPayment(chatId: number, userId: number): boolean {
    const state = this.getState(chatId, userId);
    return state !== null && state.step === 'AWAITING_CUSTOM_AMOUNT';
  }

  pruneExpired(): void {
    const now = Date.now();
    for (const [key, draft] of this.drafts.entries()) {
      if (now - draft.updatedAt > DRAFT_TTL_MS) {
        this.drafts.delete(key);
      }
    }
  }

  clearAll(): void {
    this.drafts.clear();
  }
}

export const paymentStateManager = new PaymentStateManager();
