import { describe, it, expect } from 'vitest';
import { toPaise, toRupees, formatPaise, isValidMoneyAmount } from './currency';

describe('Currency Utility (Minor Units)', () => {
  it('converts rupees to paise accurately without floating point drift', () => {
    expect(toPaise(10)).toBe(1000);
    expect(toPaise(10.5)).toBe(1050);
    expect(toPaise(99.99)).toBe(9999);
    expect(toPaise('123.45')).toBe(12345);
    expect(toPaise(0.01)).toBe(1);
  });

  it('throws on invalid rupees input', () => {
    expect(() => toPaise('abc')).toThrow(/Invalid monetary amount/);
    expect(() => toPaise(NaN)).toThrow(/Invalid monetary amount/);
  });

  it('converts paise to rupees accurately', () => {
    expect(toRupees(1000)).toBe(10);
    expect(toRupees(1050)).toBe(10.5);
    expect(toRupees(9999)).toBe(99.99);
    expect(toRupees(1)).toBe(0.01);
  });

  it('rejects non-integer paise', () => {
    expect(() => toRupees(10.5)).toThrow(/Minor units must be an integer/);
  });

  it('formats paise as INR currency string', () => {
    expect(formatPaise(1000)).toBe('₹10.00');
    expect(formatPaise(1050)).toBe('₹10.50');
    expect(formatPaise(9999)).toBe('₹99.99');
  });

  it('validates money amounts correctly', () => {
    expect(isValidMoneyAmount(100)).toBe(true);
    expect(isValidMoneyAmount(1)).toBe(true);
    expect(isValidMoneyAmount(0)).toBe(false);
    expect(isValidMoneyAmount(-50)).toBe(false);
    expect(isValidMoneyAmount(10.5)).toBe(false);
    expect(isValidMoneyAmount('100')).toBe(false);
  });
});
