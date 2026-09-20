import { describe, it, expect } from 'vitest';
import {
  validateDescription,
  parseAndValidateAmount,
  validateParticipantSelection,
  parseQuickAddExpense,
  parseExpenseInput,
} from './expense-validation';
import { ValidationError } from '../../shared/errors';

describe('Expense Validation', () => {
  describe('validateDescription', () => {
    it('accepts valid descriptions and trims whitespace', () => {
      expect(validateDescription('Dinner with friends')).toBe('Dinner with friends');
      expect(validateDescription('  Uber cab  ')).toBe('Uber cab');
    });

    it('rejects empty or whitespace-only descriptions', () => {
      expect(() => validateDescription('')).toThrow(ValidationError);
      expect(() => validateDescription('   ')).toThrow(ValidationError);
    });

    it('rejects descriptions exceeding maximum length', () => {
      const tooLong = 'a'.repeat(101);
      expect(() => validateDescription(tooLong)).toThrow(/100 characters or fewer/);
    });
  });

  describe('parseAndValidateAmount', () => {
    it('parses standard integer and decimal strings into paise', () => {
      expect(parseAndValidateAmount('2400')).toBe(240000);
      expect(parseAndValidateAmount('2400.50')).toBe(240050);
      expect(parseAndValidateAmount('2400.5')).toBe(240050);
      expect(parseAndValidateAmount('0.05')).toBe(5);
    });

    it('parses amounts with rupee currency symbols and commas', () => {
      expect(parseAndValidateAmount('₹2400')).toBe(240000);
      expect(parseAndValidateAmount('₹ 2,400.50')).toBe(240050);
      expect(parseAndValidateAmount('Rs. 500')).toBe(50000);
    });

    it('rejects zero, negative, and invalid text amounts', () => {
      expect(() => parseAndValidateAmount('0')).toThrow(/greater than zero/);
      expect(() => parseAndValidateAmount('-50')).toThrow(/valid positive amount/);
      expect(() => parseAndValidateAmount('abc')).toThrow(/valid positive amount/);
      expect(() => parseAndValidateAmount('12.345')).toThrow(/valid positive amount/);
    });
  });

  describe('validateParticipantSelection', () => {
    it('accepts and deduplicates non-empty participant list', () => {
      const result = validateParticipantSelection(['u1', 'u2', 'u1']);
      expect(result).toEqual(['u1', 'u2']);
    });

    it('rejects empty participant list', () => {
      expect(() => validateParticipantSelection([])).toThrow(/At least one participant/);
    });
  });

  describe('parseQuickAddExpense', () => {
    it('parses "Dinner 1200" into description and total amount in paise', () => {
      const res = parseQuickAddExpense('Dinner 1200');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.description).toBe('Dinner');
        expect(res.totalAmount).toBe(120000);
      }
    });

    it('parses "Cab 450"', () => {
      const res = parseQuickAddExpense('Cab 450');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.description).toBe('Cab');
        expect(res.totalAmount).toBe(45000);
      }
    });

    it('parses decimal amount "Hotel 2500.50"', () => {
      const res = parseQuickAddExpense('Hotel 2500.50');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.description).toBe('Hotel');
        expect(res.totalAmount).toBe(250050);
      }
    });

    it('handles currency prefixes like ₹ and Rs.', () => {
      const res1 = parseQuickAddExpense('Dinner ₹1200');
      expect(res1.success).toBe(true);
      if (res1.success) {
        expect(res1.description).toBe('Dinner');
        expect(res1.totalAmount).toBe(120000);
      }

      const res2 = parseQuickAddExpense('Dinner Rs. 1200');
      expect(res2.success).toBe(true);
      if (res2.success) {
        expect(res2.description).toBe('Dinner');
        expect(res2.totalAmount).toBe(120000);
      }
    });

    it('handles special characters in description', () => {
      const res = parseQuickAddExpense('Dinner & Drinks [Bar_1] 500');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.description).toBe('Dinner & Drinks [Bar_1]');
        expect(res.totalAmount).toBe(50000);
      }
    });

    it('detects missing amount when no digits exist', () => {
      const res = parseQuickAddExpense('Dinner');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errorType).toBe('MISSING_AMOUNT');
      }
    });

    it('detects missing description when only amount is passed', () => {
      const res = parseQuickAddExpense('1200');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errorType).toBe('MISSING_DESCRIPTION');
      }

      const res2 = parseQuickAddExpense('₹1200');
      expect(res2.success).toBe(false);
      if (!res2.success) {
        expect(res2.errorType).toBe('MISSING_DESCRIPTION');
      }
    });

    it('detects invalid amount (negative or zero or >2 decimals)', () => {
      const res1 = parseQuickAddExpense('Dinner -50');
      expect(res1.success).toBe(false);
      if (!res1.success) {
        expect(res1.errorType).toBe('INVALID_AMOUNT');
      }

      const res2 = parseQuickAddExpense('Dinner 0');
      expect(res2.success).toBe(false);
      if (!res2.success) {
        expect(res2.errorType).toBe('INVALID_AMOUNT');
      }

      const res3 = parseQuickAddExpense('Dinner 12.345');
      expect(res3.success).toBe(false);
      if (!res3.success) {
        expect(res3.errorType).toBe('INVALID_AMOUNT');
      }
    });

    it('detects invalid amount for non-numeric amounts', () => {
      const res = parseQuickAddExpense('Dinner 12a');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errorType).toBe('INVALID_AMOUNT');
      }

      const resAbc = parseExpenseInput('/add dinner abc');
      expect(resAbc.success).toBe(false);
      if (!resAbc.success) {
        expect(resAbc.errorType).toBe('INVALID_AMOUNT');
      }

      const resPent = parseExpenseInput('/add pent 800');
      expect(resPent.success).toBe(true);
      if (resPent.success) {
        expect(resPent.description).toBe('pent');
        expect(resPent.totalAmount).toBe(80000);
      }
    });

    it('detects malformed input for empty text', () => {
      const resEmpty = parseQuickAddExpense('');
      expect(resEmpty.success).toBe(false);
      if (!resEmpty.success) {
        expect(resEmpty.errorType).toBe('MALFORMED');
      }
    });
  });
});
