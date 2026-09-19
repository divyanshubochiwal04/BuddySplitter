import { describe, it, expect } from 'vitest';
import { escapeMarkdown, truncateText } from './markdown';

describe('Markdown Sanitizer and Utilities', () => {
  describe('escapeMarkdown', () => {
    it('returns empty string for null, undefined, or empty string', () => {
      expect(escapeMarkdown(null)).toBe('');
      expect(escapeMarkdown(undefined)).toBe('');
      expect(escapeMarkdown('')).toBe('');
    });

    it('preserves clean alphanumeric and basic punctuation', () => {
      expect(escapeMarkdown('Dinner at restaurant')).toBe('Dinner at restaurant');
      expect(escapeMarkdown('Rahul 123')).toBe('Rahul 123');
      expect(escapeMarkdown('Total: ₹1,200 (approx)')).toBe('Total: ₹1,200 (approx)');
    });

    it('escapes Telegram Markdown v1 special tokens (*, _, `, [)', () => {
      expect(escapeMarkdown('*bold text*')).toBe('\\*bold text\\*');
      expect(escapeMarkdown('_italic_username_')).toBe('\\_italic\\_username\\_');
      expect(escapeMarkdown('`code`')).toBe('\\`code\\`');
      expect(escapeMarkdown('[bracketed link]')).toBe('\\[bracketed link\\]');
    });

    it('handles mixed inputs with HTML tags, emoji, and Markdown chars', () => {
      expect(escapeMarkdown('<test>')).toBe('<test>');
      expect(escapeMarkdown('🍕 *Dinner* [veg] _fun_')).toBe('🍕 \\*Dinner\\* \\[veg\\] \\_fun\\_');
      expect(escapeMarkdown('user_name*with`weird[chars')).toBe('user\\_name\\*with\\`weird\\[chars');
    });
  });

  describe('truncateText', () => {
    it('returns text as is when under or equal to maxLength', () => {
      expect(truncateText('short', 10)).toBe('short');
      expect(truncateText('exact ten!', 10)).toBe('exact ten!');
    });

    it('truncates and adds ellipsis when exceeding maxLength', () => {
      expect(truncateText('this is a very long text', 10)).toBe('this is a…');
    });

    it('handles null, undefined, or empty gracefully', () => {
      expect(truncateText(null, 10)).toBe('');
      expect(truncateText(undefined, 10)).toBe('');
    });
  });
});
