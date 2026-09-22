import { describe, it, expect } from 'vitest';
import {
  calculateRepayAllocations,
  autoSelectDebtsForAmount,
  RepayDebtItem,
} from './repay-calculator';

describe('Repay Calculator', () => {
  const mockDebts: RepayDebtItem[] = [
    { toUserId: 'u1', toDisplayName: 'Alice', debtAmount: 30000 }, // ₹300
    { toUserId: 'u2', toDisplayName: 'Bob', debtAmount: 50000 },   // ₹500
    { toUserId: 'u3', toDisplayName: 'Charlie', debtAmount: 20000 }, // ₹200
  ];

  describe('calculateRepayAllocations', () => {
    it('returns empty allocations if no debts selected', () => {
      const res = calculateRepayAllocations(45000, mockDebts, []);
      expect(res.allocations).toEqual([]);
      expect(res.totalAllocated).toBe(0);
      expect(res.unallocatedAmount).toBe(45000);
    });

    it('allocates correctly when single debt is selected with partial repayment', () => {
      // Repay ₹450 to Bob who is owed ₹500
      const res = calculateRepayAllocations(45000, mockDebts, ['u2']);
      expect(res.allocations).toHaveLength(1);
      expect(res.allocations[0]).toEqual({
        toUserId: 'u2',
        toDisplayName: 'Bob',
        originalDebt: 50000,
        allocatedAmount: 45000,
        remainingDebt: 5000,
        isFull: false,
      });
      expect(res.totalAllocated).toBe(45000);
      expect(res.unallocatedAmount).toBe(0);
    });

    it('allocates correctly across multi-selected debts in order', () => {
      // Repay ₹450 to Alice (₹300) and Bob (₹500)
      const res = calculateRepayAllocations(45000, mockDebts, ['u1', 'u2']);
      expect(res.allocations).toHaveLength(2);

      // Alice fully paid (₹300)
      expect(res.allocations[0]).toEqual({
        toUserId: 'u1',
        toDisplayName: 'Alice',
        originalDebt: 30000,
        allocatedAmount: 30000,
        remainingDebt: 0,
        isFull: true,
      });

      // Bob partially paid (₹150 of ₹500, remaining ₹350)
      expect(res.allocations[1]).toEqual({
        toUserId: 'u2',
        toDisplayName: 'Bob',
        originalDebt: 50000,
        allocatedAmount: 15000,
        remainingDebt: 35000,
        isFull: false,
      });

      expect(res.totalAllocated).toBe(45000);
      expect(res.unallocatedAmount).toBe(0);
    });

    it('handles repaid amount less than single transaction amount', () => {
      // Repay ₹100 to Alice (₹300)
      const res = calculateRepayAllocations(10000, mockDebts, ['u1']);
      expect(res.allocations[0].allocatedAmount).toBe(10000);
      expect(res.allocations[0].remainingDebt).toBe(20000);
      expect(res.allocations[0].isFull).toBe(false);
      expect(res.totalAllocated).toBe(10000);
      expect(res.unallocatedAmount).toBe(0);
    });

    it('handles repaid amount greater than selected debt', () => {
      // Repay ₹450 to Alice only (debt is ₹300)
      const res = calculateRepayAllocations(45000, mockDebts, ['u1']);
      expect(res.allocations[0].allocatedAmount).toBe(30000);
      expect(res.allocations[0].remainingDebt).toBe(0);
      expect(res.allocations[0].isFull).toBe(true);
      expect(res.totalAllocated).toBe(30000);
      expect(res.unallocatedAmount).toBe(15000); // ₹150 left unallocated
    });

    it('handles 0 or negative target amount gracefully', () => {
      const res = calculateRepayAllocations(0, mockDebts, ['u1']);
      expect(res.totalAllocated).toBe(0);
      expect(res.allocations).toHaveLength(0);
    });
  });

  describe('autoSelectDebtsForAmount', () => {
    it('selects debts until target amount is met', () => {
      // ₹450 needed: Alice is ₹300, Bob is ₹500 -> selects Alice and Bob
      const selected = autoSelectDebtsForAmount(45000, mockDebts);
      expect(selected).toEqual(['u1', 'u2']);
    });

    it('selects single debt if first debt is enough', () => {
      // ₹250 needed: Alice is ₹300 -> selects Alice only
      const selected = autoSelectDebtsForAmount(25000, mockDebts);
      expect(selected).toEqual(['u1']);
    });

    it('selects all debts if target amount exceeds sum of all debts', () => {
      // ₹1200 needed: sum is ₹1000 -> selects all 3
      const selected = autoSelectDebtsForAmount(120000, mockDebts);
      expect(selected).toEqual(['u1', 'u2', 'u3']);
    });
  });
});
