import { describe, it, expect } from 'vitest';
import { validateCustomSplits } from './custom';
import { ValidationError } from '../../../shared/errors';

describe('Custom Split Validation', () => {
  it('validates exact match where sum of splits equals total amount', () => {
    // Total ₹2400 (240000 paise): 100000 + 80000 + 60000 = 240000 paise
    const result = validateCustomSplits(240000, [
      { userId: 'u1', amount: 100000 },
      { userId: 'u2', amount: 80000 },
      { userId: 'u3', amount: 60000 },
    ]);

    expect(result.isValid).toBe(true);
    expect(result.difference).toBe(0);
    expect(result.sum).toBe(240000);
  });

  it('detects when custom split is short of the total amount', () => {
    // Total 10000 paise, sum 8000 paise -> short by 2000 paise
    const result = validateCustomSplits(10000, [
      { userId: 'u1', amount: 5000 },
      { userId: 'u2', amount: 3000 },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.difference).toBe(2000);
    expect(result.sum).toBe(8000);
    expect(result.errorMessage).toContain('short');
  });

  it('detects when custom split exceeds the total amount', () => {
    // Total 10000 paise, sum 12000 paise -> over by 2000 paise
    const result = validateCustomSplits(10000, [
      { userId: 'u1', amount: 7000 },
      { userId: 'u2', amount: 5000 },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.difference).toBe(-2000);
    expect(result.sum).toBe(12000);
    expect(result.errorMessage).toContain('over');
  });

  it('rejects negative or non-integer amounts', () => {
    const resultNegative = validateCustomSplits(10000, [
      { userId: 'u1', amount: -100 },
      { userId: 'u2', amount: 10100 },
    ]);
    expect(resultNegative.isValid).toBe(false);

    const resultFloat = validateCustomSplits(10000, [
      { userId: 'u1', amount: 5000.5 },
      { userId: 'u2', amount: 4999.5 },
    ]);
    expect(resultFloat.isValid).toBe(false);
  });

  it('throws ValidationError for invalid total amount', () => {
    expect(() => validateCustomSplits(0, [{ userId: 'u1', amount: 0 }])).toThrow(ValidationError);
  });
});
