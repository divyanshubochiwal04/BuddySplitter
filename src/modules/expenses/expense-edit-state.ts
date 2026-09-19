export interface ExpenseEditState {
  chatId: number;
  userId: number; // Telegram user ID
  expenseId: string; // Database expense UUID
  page: number; // Page to return to
  step: 'AWAITING_NEW_DESCRIPTION';
  createdAt: number;
  updatedAt: number;
}

const EDIT_STATE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class ExpenseEditStateManager {
  private readonly states = new Map<string, ExpenseEditState>();

  private makeKey(chatId: number, userId: number): string {
    return `${chatId}:${userId}`;
  }

  private isExpired(state: ExpenseEditState): boolean {
    return Date.now() - state.updatedAt > EDIT_STATE_TTL_MS;
  }

  getState(chatId: number, userId: number): ExpenseEditState | null {
    const key = this.makeKey(chatId, userId);
    const state = this.states.get(key);

    if (!state) return null;

    if (this.isExpired(state)) {
      this.states.delete(key);
      return null;
    }

    return state;
  }

  setState(state: ExpenseEditState): void {
    const key = this.makeKey(state.chatId, state.userId);
    this.states.set(key, {
      ...state,
      updatedAt: Date.now(),
    });
  }

  clearState(chatId: number, userId: number): void {
    const key = this.makeKey(chatId, userId);
    this.states.delete(key);
  }

  isUserEditingDescription(chatId: number, userId: number): boolean {
    const state = this.getState(chatId, userId);
    return state !== null && state.step === 'AWAITING_NEW_DESCRIPTION';
  }

  pruneExpired(): void {
    const now = Date.now();
    for (const [key, state] of this.states.entries()) {
      if (now - state.updatedAt > EDIT_STATE_TTL_MS) {
        this.states.delete(key);
      }
    }
  }

  clearAll(): void {
    this.states.clear();
  }
}

export const expenseEditStateManager = new ExpenseEditStateManager();
