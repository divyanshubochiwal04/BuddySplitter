import { describe, it, expect } from 'vitest';
import {
  escapeMarkdown,
  truncateText,
  validateTelegramMarkdown,
  sanitizeTelegramMarkdown,
} from './markdown';
import { HELP_MESSAGE } from '../bot/messages/help';
import { formatMembersListMessage } from '../bot/messages/members';
import {
  formatExpenseHistoryMessage,
  formatExpenseDetailsMessage,
  formatDeleteConfirmationMessage,
} from '../bot/messages/expense-management';
import { formatExpenseSuccess } from '../bot/messages/expense';
import { formatGroupBalanceSummary, formatUserPersonalBalance } from '../modules/balances/balance.formatter';
import { formatUserSettlementSummary, formatGroupSettlementPlan } from '../modules/settlements/settlement.formatter';

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

  describe('validateTelegramMarkdown', () => {
    it('validates empty, null, or undefined strings as valid', () => {
      expect(validateTelegramMarkdown('')).toEqual({ isValid: true });
      expect(validateTelegramMarkdown(null)).toEqual({ isValid: true });
      expect(validateTelegramMarkdown(undefined)).toEqual({ isValid: true });
    });

    it('validates properly formatted bold, italic, code, and links', () => {
      expect(validateTelegramMarkdown('*bold text*')).toEqual({ isValid: true });
      expect(validateTelegramMarkdown('_italic text_')).toEqual({ isValid: true });
      expect(validateTelegramMarkdown('`inline code`')).toEqual({ isValid: true });
      expect(validateTelegramMarkdown('```\ncode block\n```')).toEqual({ isValid: true });
      expect(validateTelegramMarkdown('[Policy](https://example.com)')).toEqual({ isValid: true });
    });

    it('validates text with escaped delimiters without entity creation', () => {
      expect(validateTelegramMarkdown('\\*not bold\\*')).toEqual({ isValid: true });
      expect(validateTelegramMarkdown('• /my\\_data — view records')).toEqual({ isValid: true });
      expect(validateTelegramMarkdown('• /delete\\_my\\_data — anonymize')).toEqual({ isValid: true });
    });

    it('detects unclosed bold with exact byte offset', () => {
      const res = validateTelegramMarkdown('Hello *world');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('byte offset 6');
      expect(res.errorOffset).toBe(6);
    });

    it('detects unclosed italic with exact byte offset (reproducing production bug at offset 533)', () => {
      const brokenHelp = [
        '📖 *BuddySplitter Guide*',
        '',
        'Split group expenses and track settlements without spreadsheets.',
        '',
        '*Commands:*',
        '• /start — Open main interactive menu',
        '• /add — Create an expense',
        '• /expenses — View expense history',
        '• /balance — See your balance & status',
        '• /summary — See group balances',
        '• /settle — See who owes whom & settle up',
        '• /payments — View repayment history',
        '• /members — View group members',
        '• /privacy — View privacy policy & data practices',
        '• /my_data — Inspect your stored records',
        '• /delete_my_data — Anonymize your personal profile',
        '• /cancel — Cancel the current action',
        '',
        '💡 *Tip:* You can also use the interactive buttons in the menu without typing commands!',
      ].join('\n');

      const res = validateTelegramMarkdown(brokenHelp);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe("Can't find end of the entity starting at byte offset 533");
      expect(res.errorOffset).toBe(533);
    });

    it('detects unclosed inline code and code blocks', () => {
      const res1 = validateTelegramMarkdown('Check `code');
      expect(res1.isValid).toBe(false);
      expect(res1.error).toContain('inline code');

      const res2 = validateTelegramMarkdown('```\ncode without close');
      expect(res2.isValid).toBe(false);
      expect(res2.error).toContain('code block');
    });
  });

  describe('sanitizeTelegramMarkdown', () => {
    it('returns empty string for null, undefined, or empty', () => {
      expect(sanitizeTelegramMarkdown(null)).toBe('');
      expect(sanitizeTelegramMarkdown(undefined)).toBe('');
      expect(sanitizeTelegramMarkdown('')).toBe('');
    });

    it('preserves valid Markdown formatting intact', () => {
      const valid = '📖 *BuddySplitter Guide*\n• `code`\n• _italic_\n• [Link](https://example.com)';
      expect(sanitizeTelegramMarkdown(valid)).toBe(valid);
    });

    it('auto-heals unclosed bold and italic by escaping unclosed delimiters', () => {
      const broken = 'Hello *world without close and _italic';
      const fixed = sanitizeTelegramMarkdown(broken);
      expect(validateTelegramMarkdown(fixed).isValid).toBe(true);
      expect(fixed).toBe('Hello \\*world without close and \\_italic');
    });

    it('heals the production unclosed entity at offset 533', () => {
      const broken = '• /my_data — view\n• /delete_my_data — delete';
      const healed = sanitizeTelegramMarkdown(broken);
      expect(validateTelegramMarkdown(healed).isValid).toBe(true);
    });
  });

  describe('Message formatters Markdown safety with dynamic user inputs', () => {
    it('validates HELP_MESSAGE produces 100% valid Telegram legacy Markdown', () => {
      const result = validateTelegramMarkdown(HELP_MESSAGE);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('ensures formatMembersListMessage handles users with underscores and asterisks', () => {
      const msg = formatMembersListMessage('Trip_to_Goa*2026', [
        { displayName: 'john_doe', username: 'john_doe_99' },
        { displayName: 'alice*star', username: null },
      ]);
      expect(validateTelegramMarkdown(msg).isValid).toBe(true);
    });

    it('ensures formatExpenseHistoryMessage handles descriptions with Markdown tokens', () => {
      const msg = formatExpenseHistoryMessage(
        {
          expenses: [
            {
              id: '1',
              description: 'Pizza *with* cheese_burst & `coke`',
              totalAmount: 150000,
              payerName: 'alex_payer',
              expenseDate: '2026-09-19T10:00:00Z',
              splitType: 'equal',
              participantCount: 3,
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        },
        'Group_Alpha'
      );
      expect(validateTelegramMarkdown(msg).isValid).toBe(true);
    });

    it('ensures formatGroupBalanceSummary handles usernames with underscores', () => {
      const msg = formatGroupBalanceSummary({
        creditors: [{ userId: '1', displayName: 'alex_creditor', netBalance: 5000 }],
        debtors: [{ userId: '2', displayName: 'bob_debtor', netBalance: -5000 }],
        settled: [{ userId: '3', displayName: 'charlie_settled' }],
        totalExpensesAmount: 10000,
        totalExpensesCount: 1,
      });
      expect(validateTelegramMarkdown(msg).isValid).toBe(true);
    });

    it('ensures formatGroupSettlementPlan handles transaction parties with formatting tokens', () => {
      const msg = formatGroupSettlementPlan({
        isSettled: false,
        totalAmount: 5000,
        totalPaymentsCount: 1,
        transactions: [
          {
            fromUserId: '1',
            fromDisplayName: 'alice_from',
            toUserId: '2',
            toDisplayName: 'bob_to*boss',
            amount: 5000,
          },
        ],
      });
      expect(validateTelegramMarkdown(msg).isValid).toBe(true);
    });

    it('ensures formatExpenseSuccess handles names and descriptions with tokens', () => {
      const msg = formatExpenseSuccess('Special_Dinner*Deluxe', 250000, 'sam_payer');
      expect(validateTelegramMarkdown(msg).isValid).toBe(true);
    });

    it('ensures formatDeleteConfirmationMessage handles descriptions with tokens', () => {
      const msg = formatDeleteConfirmationMessage({
        id: '1',
        description: 'Team_Lunch*Friday',
        totalAmount: 40000,
        payerName: 'dave_payer',
        creatorName: 'dave_payer',
        expenseDate: '2026-09-19T12:00:00Z',
        splitType: 'equal',
        canManage: true,
        hasRepayments: false,
        groupId: 'g-1',
        createdByUserId: 123,
        splits: [],
      });
      expect(validateTelegramMarkdown(msg).isValid).toBe(true);
    });
  });
});
