import { describe, it, expect, beforeEach } from 'vitest';
import { ExpenseStateManager, ExpenseDraft } from './expense-state';

describe('ExpenseStateManager', () => {
  let stateManager: ExpenseStateManager;

  beforeEach(() => {
    stateManager = new ExpenseStateManager();
  });

  it('isolates state per group chat and user', () => {
    const draftUser1GroupA: ExpenseDraft = {
      chatId: 100,
      userId: 1,
      groupId: 'grp-a',
      creatorUserId: 'db-u1',
      step: 'AWAITING_DESCRIPTION',
      participantUserIds: [],
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const draftUser2GroupA: ExpenseDraft = {
      chatId: 100,
      userId: 2,
      groupId: 'grp-a',
      creatorUserId: 'db-u2',
      step: 'AWAITING_AMOUNT',
      participantUserIds: [],
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const draftUser1GroupB: ExpenseDraft = {
      chatId: 200,
      userId: 1,
      groupId: 'grp-b',
      creatorUserId: 'db-u1',
      step: 'AWAITING_PAYER',
      participantUserIds: [],
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    stateManager.setState(draftUser1GroupA);
    stateManager.setState(draftUser2GroupA);
    stateManager.setState(draftUser1GroupB);

    expect(stateManager.getState(100, 1)?.step).toBe('AWAITING_DESCRIPTION');
    expect(stateManager.getState(100, 2)?.step).toBe('AWAITING_AMOUNT');
    expect(stateManager.getState(200, 1)?.step).toBe('AWAITING_PAYER');
  });

  it('updates draft state cleanly', () => {
    const draft: ExpenseDraft = {
      chatId: 100,
      userId: 1,
      groupId: 'grp-a',
      creatorUserId: 'db-u1',
      step: 'AWAITING_DESCRIPTION',
      participantUserIds: [],
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    stateManager.setState(draft);
    stateManager.updateState(100, 1, {
      description: 'Dinner',
      totalAmount: 240000,
      step: 'AWAITING_PAYER',
    });

    const updated = stateManager.getState(100, 1);
    expect(updated?.description).toBe('Dinner');
    expect(updated?.totalAmount).toBe(240000);
    expect(updated?.step).toBe('AWAITING_PAYER');
  });

  it('clears state on cancel or finish', () => {
    const draft: ExpenseDraft = {
      chatId: 100,
      userId: 1,
      groupId: 'grp-a',
      creatorUserId: 'db-u1',
      step: 'AWAITING_DESCRIPTION',
      participantUserIds: [],
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    stateManager.setState(draft);
    expect(stateManager.getState(100, 1)).not.toBeNull();

    stateManager.clearState(100, 1);
    expect(stateManager.getState(100, 1)).toBeNull();
  });

  it('prunes expired drafts after TTL', () => {
    const pastTime = Date.now() - 20 * 60 * 1000; // 20 minutes ago (TTL is 15 mins)
    const staleDraft: ExpenseDraft = {
      chatId: 100,
      userId: 1,
      groupId: 'grp-a',
      creatorUserId: 'db-u1',
      step: 'AWAITING_DESCRIPTION',
      participantUserIds: [],
      splits: [],
      createdAt: pastTime,
      updatedAt: pastTime,
    };

    stateManager.setState(staleDraft);
    // Overwrite updatedAt back to the past
    (staleDraft as any).updatedAt = pastTime;
    (stateManager as any).drafts.set('100:1', staleDraft);

    expect(stateManager.getState(100, 1)).toBeNull();
  });
});
