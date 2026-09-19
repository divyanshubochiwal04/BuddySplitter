import { describe, it, expect } from 'vitest';
import {
  formatUserPersonalBalance,
  formatGroupBalanceSummary,
} from './balance.formatter';
import { GroupBalanceSummary, UserPersonalBalance } from './balance.types';

describe('Balance Formatter', () => {
  describe('formatUserPersonalBalance', () => {
    it('formats creditor balance with green emoji and positive net', () => {
      const balance: UserPersonalBalance = {
        userId: 'u-1',
        displayName: 'Alice',
        paidAmount: 30000,
        owedAmount: 10000,
        netBalance: 20000,
        category: 'creditor',
      };

      const result = formatUserPersonalBalance(balance);
      expect(result).toContain('💰 *Your Balance*');
      expect(result).toContain('🟢 *You should receive:* ₹200.00');
      expect(result).toContain('• *Paid:* ₹300.00');
      expect(result).toContain('• *Your share:* ₹100.00');
      expect(result).toContain('• *Net:* +₹200.00');
    });

    it('formats debtor balance with red emoji and negative net', () => {
      const balance: UserPersonalBalance = {
        userId: 'u-2',
        displayName: 'Bob',
        paidAmount: 0,
        owedAmount: 10000,
        netBalance: -10000,
        category: 'debtor',
      };

      const result = formatUserPersonalBalance(balance);
      expect(result).toContain('💰 *Your Balance*');
      expect(result).toContain('🔴 *You owe:* ₹100.00');
      expect(result).toContain('• *Paid:* ₹0.00');
      expect(result).toContain('• *Your share:* ₹100.00');
      expect(result).toContain('• *Net:* -₹100.00');
    });

    it('formats settled balance with white emoji and zero net', () => {
      const balance: UserPersonalBalance = {
        userId: 'u-3',
        displayName: 'Charlie',
        paidAmount: 5000,
        owedAmount: 5000,
        netBalance: 0,
        category: 'settled',
      };

      const result = formatUserPersonalBalance(balance);
      expect(result).toContain('💰 *Your Balance*');
      expect(result).toContain("⚪ *You're all settled up!*");
      expect(result).toContain('• *Paid:* ₹50.00');
      expect(result).toContain('• *Your share:* ₹50.00');
      expect(result).toContain('• *Net:* ₹0.00');
    });
  });

  describe('formatGroupBalanceSummary', () => {
    it('formats empty group with helpful prompt to type /add', () => {
      const summary: GroupBalanceSummary = {
        groupId: 'grp-1',
        totalExpensesCount: 0,
        totalExpensesAmount: 0,
        creditors: [],
        debtors: [],
        settled: [],
        allBalances: [],
      };

      const result = formatGroupBalanceSummary(summary);
      expect(result).toContain('📊 *Group Summary*');
      expect(result).toContain('No expenses recorded yet in this group.');
      expect(result).toContain('Type /add to record the first expense!');
    });

    it('formats full group summary with creditors, debtors, and settled members', () => {
      const summary: GroupBalanceSummary = {
        groupId: 'grp-1',
        totalExpensesCount: 3,
        totalExpensesAmount: 45000,
        creditors: [
          {
            userId: 'u-1',
            displayName: 'Alice',
            paidAmount: 30000,
            owedAmount: 10000,
            netBalance: 20000,
            category: 'creditor',
          },
        ],
        debtors: [
          {
            userId: 'u-2',
            displayName: 'Bob',
            paidAmount: 0,
            owedAmount: 20000,
            netBalance: -20000,
            category: 'debtor',
          },
        ],
        settled: [
          {
            userId: 'u-3',
            displayName: 'Charlie',
            paidAmount: 15000,
            owedAmount: 15000,
            netBalance: 0,
            category: 'settled',
          },
        ],
        allBalances: [],
      };

      const result = formatGroupBalanceSummary(summary);
      expect(result).toContain('📊 *Group Summary*');
      expect(result).toContain('🟢 Alice receives ₹200.00');
      expect(result).toContain('🔴 Bob owes ₹200.00');
      expect(result).toContain('⚪ *Settled:*');
      expect(result).toContain('• Charlie');
      expect(result).toContain('💰 *Total expenses:* ₹450.00 (3 expenses)');

      // Strictly verify no settlement instructions exist
      expect(result.toLowerCase()).not.toContain('should pay');
      expect(result.toLowerCase()).not.toContain('settlement plan');
      expect(result.toLowerCase()).not.toContain('pays');
    });

    it('handles singular expense count label correctly', () => {
      const summary: GroupBalanceSummary = {
        groupId: 'grp-1',
        totalExpensesCount: 1,
        totalExpensesAmount: 1000,
        creditors: [
          {
            userId: 'u-1',
            displayName: 'Alice',
            paidAmount: 1000,
            owedAmount: 500,
            netBalance: 500,
            category: 'creditor',
          },
        ],
        debtors: [
          {
            userId: 'u-2',
            displayName: 'Bob',
            paidAmount: 0,
            owedAmount: 500,
            netBalance: -500,
            category: 'debtor',
          },
        ],
        settled: [],
        allBalances: [],
      };

      const result = formatGroupBalanceSummary(summary);
      expect(result).toContain('💰 *Total expenses:* ₹10.00 (1 expense)');
    });

    it('formats group summary with total settled payments when repayments exist', () => {
      const summary = {
        groupId: 'grp-1',
        totalExpensesCount: 1,
        totalExpensesAmount: 1000,
        totalPaymentsCount: 1,
        totalPaymentsAmount: 500,
        creditors: [],
        debtors: [],
        settled: [
          {
            userId: 'u-1',
            displayName: 'Alice',
            paidAmount: 1000,
            owedAmount: 500,
            rawBalance: 500,
            paymentsMade: 0,
            paymentsReceived: 500,
            outstandingNet: 0,
            category: 'settled' as const,
          },
          {
            userId: 'u-2',
            displayName: 'Bob',
            paidAmount: 0,
            owedAmount: 500,
            rawBalance: -500,
            paymentsMade: 500,
            paymentsReceived: 0,
            outstandingNet: 0,
            category: 'settled' as const,
          },
        ],
        allBalances: [],
      };

      const result = formatGroupBalanceSummary(summary as any);
      expect(result).toContain('💰 *Total expenses:* ₹10.00 (1 expense)');
      expect(result).toContain('💸 *Total settled:* ₹5.00 (1 payment)');
      expect(result).toContain('⚪ *Settled:*');
      expect(result).toContain('• Alice');
      expect(result).toContain('• Bob');
    });

    it('formats reconciled personal balance with payments breakdown', () => {
      const balance = {
        userId: 'u-2',
        displayName: 'Bob',
        paidAmount: 0,
        owedAmount: 10000,
        rawBalance: -10000,
        paymentsMade: 5000,
        paymentsReceived: 0,
        outstandingNet: -5000,
        category: 'debtor' as const,
      };

      const result = formatUserPersonalBalance(balance);
      expect(result).toContain('🔴 *You owe:* ₹50.00');
      expect(result).toContain('• *Paid:* ₹0.00');
      expect(result).toContain('• *Your share:* ₹100.00');
      expect(result).toContain('• *Expense net:* -₹100.00');
      expect(result).toContain('• *Payments made:* ₹50.00');
      expect(result).toContain('• *Payments received:* ₹0.00');
      expect(result).toContain('• *Outstanding:* -₹50.00');
    });
  });
});
