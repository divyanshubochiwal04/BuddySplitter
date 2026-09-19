import { describe, it, expect } from 'vitest';
import {
  formatUserSettlementSummary,
  formatGroupSettlementPlan,
} from './settlement.formatter';
import { GroupSettlementPlan, UserSettlementSummary } from './settlement.types';

describe('Settlement Formatter', () => {
  describe('formatUserSettlementSummary', () => {
    it('formats settled user message when user has zero settlements', () => {
      const summary: UserSettlementSummary = {
        userId: 'u-1',
        displayName: 'Alice',
        payments: [],
        receivables: [],
        totalToPay: 0,
        totalToReceive: 0,
        netBalance: 0,
        isSettled: true,
      };

      const result = formatUserSettlementSummary(summary);
      expect(result).toContain('💸 *Your Settlements*');
      expect(result).toContain("⚪ *You're all settled up!*");
      expect(result).toContain('No payments or receivables needed.');
    });

    it('formats debts when user needs to pay others', () => {
      const summary: UserSettlementSummary = {
        userId: 'u-1',
        displayName: 'Bob',
        payments: [
          {
            fromUserId: 'u-1',
            fromDisplayName: 'Bob',
            toUserId: 'u-2',
            toDisplayName: 'Alice',
            amount: 120000,
          },
          {
            fromUserId: 'u-1',
            fromDisplayName: 'Bob',
            toUserId: 'u-3',
            toDisplayName: 'Rahul',
            amount: 50000,
          },
        ],
        receivables: [],
        totalToPay: 170000,
        totalToReceive: 0,
        netBalance: -170000,
        isSettled: false,
      };

      const result = formatUserSettlementSummary(summary);
      expect(result).toContain('💸 *Your Settlements*');
      expect(result).toContain('🔴 *You pay:*');
      expect(result).toContain('• Alice — ₹1200.00');
      expect(result).toContain('• Rahul — ₹500.00');
      expect(result).not.toContain('🟢 *You receive:*');
    });

    it('formats receivables when others need to pay user', () => {
      const summary: UserSettlementSummary = {
        userId: 'u-1',
        displayName: 'Aman',
        payments: [],
        receivables: [
          {
            fromUserId: 'u-2',
            fromDisplayName: 'Dev',
            toUserId: 'u-1',
            toDisplayName: 'Aman',
            amount: 80000,
          },
        ],
        totalToPay: 0,
        totalToReceive: 80000,
        netBalance: 80000,
        isSettled: false,
      };

      const result = formatUserSettlementSummary(summary);
      expect(result).toContain('💸 *Your Settlements*');
      expect(result).toContain('🟢 *You receive:*');
      expect(result).toContain('• Dev — ₹800.00');
      expect(result).not.toContain('🔴 *You pay:*');
    });

    it('formats both payments and receivables if user has mixed standing', () => {
      const summary: UserSettlementSummary = {
        userId: 'u-1',
        displayName: 'User',
        payments: [
          {
            fromUserId: 'u-1',
            fromDisplayName: 'User',
            toUserId: 'u-2',
            toDisplayName: 'Alice',
            amount: 3000,
          },
        ],
        receivables: [
          {
            fromUserId: 'u-3',
            fromDisplayName: 'Bob',
            toUserId: 'u-1',
            toDisplayName: 'User',
            amount: 5000,
          },
        ],
        totalToPay: 3000,
        totalToReceive: 5000,
        netBalance: 2000,
        isSettled: false,
      };

      const result = formatUserSettlementSummary(summary);
      expect(result).toContain('🔴 *You pay:*');
      expect(result).toContain('• Alice — ₹30.00');
      expect(result).toContain('🟢 *You receive:*');
      expect(result).toContain('• Bob — ₹50.00');
    });
  });

  describe('formatGroupSettlementPlan', () => {
    it('formats all settled up when group has no pending settlements', () => {
      const plan: GroupSettlementPlan = {
        groupId: 'grp-1',
        transactions: [],
        totalAmount: 0,
        totalPaymentsCount: 0,
        isSettled: true,
      };

      const result = formatGroupSettlementPlan(plan);
      expect(result).toContain('💸 *Group Settlement Plan*');
      expect(result).toContain('⚪ *All settled up!*');
      expect(result).toContain('Everyone in this group is even. No payments needed.');
    });

    it('formats active group settlement plan with transactions and totals', () => {
      const plan: GroupSettlementPlan = {
        groupId: 'grp-1',
        transactions: [
          {
            fromUserId: 'u-bob',
            fromDisplayName: 'Bob',
            toUserId: 'u-alice',
            toDisplayName: 'Alice',
            amount: 120000,
          },
          {
            fromUserId: 'u-charlie',
            fromDisplayName: 'Charlie',
            toUserId: 'u-alice',
            toDisplayName: 'Alice',
            amount: 80000,
          },
        ],
        totalAmount: 200000,
        totalPaymentsCount: 2,
        isSettled: false,
      };

      const result = formatGroupSettlementPlan(plan);
      expect(result).toContain('💸 *Group Settlement Plan*');
      expect(result).toContain('🔴 *Recommended Payments:*');
      expect(result).toContain('• Bob → Alice ₹1200.00');
      expect(result).toContain('• Charlie → Alice ₹800.00');
      expect(result).toContain('💰 *Total to settle:* ₹2000.00');
      expect(result).toContain('🔄 *Payments:* 2 payments');
      expect(result).toContain('recommendation only');
    });

    it('handles single payment label accurately', () => {
      const plan: GroupSettlementPlan = {
        groupId: 'grp-1',
        transactions: [
          {
            fromUserId: 'u-bob',
            fromDisplayName: 'Bob',
            toUserId: 'u-alice',
            toDisplayName: 'Alice',
            amount: 5000,
          },
        ],
        totalAmount: 5000,
        totalPaymentsCount: 1,
        isSettled: false,
      };

      const result = formatGroupSettlementPlan(plan);
      expect(result).toContain('🔄 *Payments:* 1 payment');
    });
  });
});
