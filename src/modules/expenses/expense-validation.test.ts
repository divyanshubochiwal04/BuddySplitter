import { describe, it, expect } from 'vitest';
import {
  validateDescription,
  parseAndValidateAmount,
  validateParticipantSelection,
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
});
