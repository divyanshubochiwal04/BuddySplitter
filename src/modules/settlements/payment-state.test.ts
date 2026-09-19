import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentStateManager } from './payment-state';

describe('PaymentStateManager', () => {
  let manager: PaymentStateManager;

  beforeEach(() => {
    manager = new PaymentStateManager();
  });

  it('manages draft lifecycle properly', () => {
    const draft = {
      chatId: -100,
      userId: 1,
      groupId: 'grp-1',
      payerUserId: 'usr-1',
      payerDisplayName: 'Bob',
      recipientUserId: 'usr-2',
      recipientDisplayName: 'Alice',
      maxAmount: 5000,
      amount: 5000,
      step: 'AWAITING_CONFIRMATION' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    manager.setState(draft);

    const retrieved = manager.getState(-100, 1);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.payerDisplayName).toBe('Bob');
    expect(retrieved?.amount).toBe(5000);

    manager.updateState(-100, 1, { amount: 2500 });
    expect(manager.getState(-100, 1)?.amount).toBe(2500);

    manager.clearState(-100, 1);
    expect(manager.getState(-100, 1)).toBeNull();
  });

  it('detects when user is awaiting custom amount input', () => {
    manager.setState({
      chatId: -100,
      userId: 1,
      groupId: 'grp-1',
      payerUserId: 'usr-1',
      payerDisplayName: 'Bob',
      step: 'AWAITING_CUSTOM_AMOUNT',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(manager.isUserRecordingPayment(-100, 1)).toBe(true);
    expect(manager.isUserRecordingPayment(-100, 2)).toBe(false);
  });

  it('expires drafts after TTL', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    manager.setState({
      chatId: -100,
      userId: 1,
      groupId: 'grp-1',
      payerUserId: 'usr-1',
      payerDisplayName: 'Bob',
      step: 'AWAITING_CUSTOM_AMOUNT',
      createdAt: now,
      updatedAt: now,
    });

    // Advance beyond 15 minutes (16 minutes)
    vi.spyOn(Date, 'now').mockReturnValue(now + 16 * 60 * 1000);

    expect(manager.getState(-100, 1)).toBeNull();

    vi.restoreAllMocks();
  });
});
