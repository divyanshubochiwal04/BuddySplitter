import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import { escapeMarkdown } from '../shared/markdown';
import { formatMembersListMessage } from './messages/members';
import { formatExpenseHistoryMessage } from './messages/expense-management';
import { buildGroupMenuKeyboard, buildPrivateMenuKeyboard } from './keyboards';
import { HELP_MESSAGE, PRIVATE_START_MESSAGE, GROUP_START_MESSAGE } from './messages';
import { handleCancel } from './commands/cancel';
import { expenseStateManager } from '../modules/expenses/expense-state';
import { paymentStateManager } from '../modules/settlements/payment-state';
import { CommandContext, Context } from 'grammy';


describe('Phase 10 — UX Polish', () => {
  // ──────────────────────────────────────────────────────────
  // 1. Markdown Escaping
  // ──────────────────────────────────────────────────────────
  describe('escapeMarkdown — user-supplied text safety', () => {
    it('escapes asterisk from expense descriptions', () => {
      expect(escapeMarkdown('*bold*')).toBe('\\*bold\\*');
    });

    it('escapes underscore from display names', () => {
      expect(escapeMarkdown('user_name')).toBe('user\\_name');
    });

    it('escapes backtick in descriptions', () => {
      expect(escapeMarkdown('`code`')).toBe('\\`code\\`');
    });

    it('escapes square bracket in description', () => {
      expect(escapeMarkdown('[linktext]')).toBe('\\[linktext\\]');
    });

    it('handles emoji without escaping', () => {
      expect(escapeMarkdown('🍕 Dinner')).toBe('🍕 Dinner');
    });

    it('handles HTML angle brackets without escaping (they are safe in Markdown v1)', () => {
      expect(escapeMarkdown('<test>')).toBe('<test>');
    });

    it('handles null and undefined gracefully', () => {
      expect(escapeMarkdown(null)).toBe('');
      expect(escapeMarkdown(undefined)).toBe('');
    });

    it('handles very long descriptions without errors', () => {
      const long = 'a'.repeat(500);
      expect(escapeMarkdown(long)).toBe(long);
    });
  });

  // ──────────────────────────────────────────────────────────
  // 2. Group Menu Keyboard
  // ──────────────────────────────────────────────────────────
  describe('Group Menu Keyboard', () => {
    it('has exactly 8 buttons', () => {
      const kb = buildGroupMenuKeyboard();
      expect(kb.inline_keyboard.flat()).toHaveLength(8);
    });

    it('includes all required action buttons', () => {
      const kb = buildGroupMenuKeyboard();
      const texts = kb.inline_keyboard.flat().map((b) => b.text);
      expect(texts).toContain('➕ Add Expense');
      expect(texts).toContain('📋 Expenses');
      expect(texts).toContain('💰 My Balance');
      expect(texts).toContain('📊 Group Summary');
      expect(texts).toContain('💸 Settle Up');
      expect(texts).toContain('💳 Payments');
      expect(texts).toContain('👥 Members');
      expect(texts).toContain('❓ Help');
    });

    it('💳 Payments button routes to action:payments', () => {
      const kb = buildGroupMenuKeyboard();
      const btn = kb.inline_keyboard.flat().find((b) => b.text === '💳 Payments');
      expect(btn).toBeDefined();
      expect('callback_data' in btn! && btn.callback_data).toBe('action:payments');
    });

    it('❓ Help button routes to menu:help', () => {
      const kb = buildGroupMenuKeyboard();
      const btn = kb.inline_keyboard.flat().find((b) => b.text === '❓ Help');
      expect(btn).toBeDefined();
      expect('callback_data' in btn! && btn.callback_data).toBe('menu:help');
    });
  });

  // ──────────────────────────────────────────────────────────
  // 3. Private Menu Keyboard
  // ──────────────────────────────────────────────────────────
  describe('Private Menu Keyboard', () => {
    it('has Add BuddySplitter button with group URL when username is set', () => {
      const kb = buildPrivateMenuKeyboard('SplitterBot');
      const btn = kb.inline_keyboard.flat().find((b) => b.text.includes('Add BuddySplitter'));
      expect(btn).toBeDefined();
      expect('url' in btn! && btn.url).toBe('https://t.me/SplitterBot?startgroup=true');
    });

    it('has How it Works button routing to menu:help', () => {
      const kb = buildPrivateMenuKeyboard('SplitterBot');
      const btn = kb.inline_keyboard.flat().find((b) => b.text.includes('How it Works'));
      expect(btn).toBeDefined();
      expect('callback_data' in btn! && btn.callback_data).toBe('menu:help');
    });

    it('falls back to callback button when username is absent', () => {
      const kb = buildPrivateMenuKeyboard();
      const btn = kb.inline_keyboard.flat().find((b) => b.text.includes('Add BuddySplitter'));
      expect(btn).toBeDefined();
      expect('callback_data' in btn! && btn.callback_data).toBe('menu:add_to_group');
    });
  });

  // ──────────────────────────────────────────────────────────
  // 4. Start / Help Messages
  // ──────────────────────────────────────────────────────────
  describe('Start and Help messages', () => {
    it('PRIVATE_START_MESSAGE contains all required phrases', () => {
      expect(PRIVATE_START_MESSAGE).toContain('👋 Welcome to BuddySplitter!');
      expect(PRIVATE_START_MESSAGE).toContain('Group expenses made simple.');
      expect(PRIVATE_START_MESSAGE).toContain('Add me to a group and split expenses without spreadsheets.');
    });

    it('GROUP_START_MESSAGE contains all required phrases', () => {
      expect(GROUP_START_MESSAGE).toContain('👋 BuddySplitter is ready!');
      expect(GROUP_START_MESSAGE).toContain('help this group track expenses and settlements.');
    });

    it('HELP_MESSAGE contains all core commands', () => {
      expect(HELP_MESSAGE).toContain('/add');
      expect(HELP_MESSAGE).toContain('/balance');
      expect(HELP_MESSAGE).toContain('/summary');
      expect(HELP_MESSAGE).toContain('/settle');
      expect(HELP_MESSAGE).toContain('/payments');
      expect(HELP_MESSAGE).toContain('/expenses');
      expect(HELP_MESSAGE).toContain('/members');
      expect(HELP_MESSAGE).toContain('/cancel');
      expect(HELP_MESSAGE).toContain('/start');
    });
  });

  // ──────────────────────────────────────────────────────────
  // 5. Empty States
  // ──────────────────────────────────────────────────────────
  describe('Empty States', () => {
    it('shows no-expenses empty state', () => {
      const result = formatExpenseHistoryMessage({
        expenses: [],
        totalCount: 0,
        page: 1,
        totalPages: 1,
        pageSize: 5,
      });
      expect(result).toContain('No expenses yet');
    });

    it('shows no-members empty state', () => {
      const result = formatMembersListMessage('My Group', []);
      expect(result).toContain('No active members found');
    });

    it('shows no-members message without group title escaping issues', () => {
      const result = formatMembersListMessage('Group_Name*Test', []);
      expect(result).toContain('Group\\_Name\\*Test');
    });
  });

  // ──────────────────────────────────────────────────────────
  // 6. Members formatting with escaping
  // ──────────────────────────────────────────────────────────
  describe('Members formatting', () => {
    it('escapes special characters in member display names', () => {
      const result = formatMembersListMessage('Test Group', [
        { displayName: 'User_*Name', username: 'user_123' },
      ]);
      expect(result).toContain('User\\_\\*Name');
    });

    it('shows member count in header', () => {
      const result = formatMembersListMessage('Goa Trip', [
        { displayName: 'Alice', username: null },
        { displayName: 'Bob', username: null },
      ]);
      expect(result).toContain('Goa Trip — Active Members (2)');
    });
  });

  // ──────────────────────────────────────────────────────────
  // 7. Cancel command clears all 3 state managers
  // ──────────────────────────────────────────────────────────
  describe('/cancel command — clears all active states', () => {
    beforeEach(() => {
      expenseStateManager.clearAll();
      paymentStateManager.clearAll();
    });

    it('replies with "No active action" when no states are active', async () => {
      const replyMock = vi.fn().mockResolvedValue(undefined);
      const mockCtx = {
        chat: { id: -100001 },
        from: { id: 1001 },
        reply: replyMock,
      } as unknown as CommandContext<Context>;

      await handleCancel(mockCtx);
      expect(replyMock).toHaveBeenCalledWith('ℹ️ No active action to cancel.');
    });

    it('clears expense state and replies "Action cancelled"', async () => {
      expenseStateManager.setState({
        chatId: -100001,
        userId: 1001,
        groupId: 'grp-1',
        creatorUserId: 'u-1',
        step: 'AWAITING_DESCRIPTION',
        participantUserIds: [],
        splits: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const replyMock = vi.fn().mockResolvedValue(undefined);
      const mockCtx = {
        chat: { id: -100001 },
        from: { id: 1001 },
        reply: replyMock,
      } as unknown as CommandContext<Context>;

      await handleCancel(mockCtx);
      expect(replyMock).toHaveBeenCalledWith('❌ Action cancelled.');
      expect(expenseStateManager.getState(-100001, 1001)).toBeNull();
    });

    it('clears payment state and replies "Action cancelled"', async () => {
      paymentStateManager.setState({
        chatId: -100001,
        userId: 1001,
        groupId: 'grp-1',
        payerUserId: 'u-1',
        payerDisplayName: 'Alice',
        step: 'AWAITING_RECIPIENT',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const replyMock = vi.fn().mockResolvedValue(undefined);
      const mockCtx = {
        chat: { id: -100001 },
        from: { id: 1001 },
        reply: replyMock,
      } as unknown as CommandContext<Context>;

      await handleCancel(mockCtx);
      expect(replyMock).toHaveBeenCalledWith('❌ Action cancelled.');
      expect(paymentStateManager.getState(-100001, 1001)).toBeNull();
    });

    it('user states remain isolated between different users', async () => {
      expenseStateManager.setState({
        chatId: -100001,
        userId: 1001,
        groupId: 'grp-1',
        creatorUserId: 'u-1',
        step: 'AWAITING_DESCRIPTION',
        participantUserIds: [],
        splits: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      expenseStateManager.setState({
        chatId: -100001,
        userId: 9999,
        groupId: 'grp-1',
        creatorUserId: 'u-9999',
        step: 'AWAITING_DESCRIPTION',
        participantUserIds: [],
        splits: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const replyMock = vi.fn().mockResolvedValue(undefined);
      const mockCtx = {
        chat: { id: -100001 },
        from: { id: 1001 },
        reply: replyMock,
      } as unknown as CommandContext<Context>;

      await handleCancel(mockCtx);

      // User 1001's state cleared
      expect(expenseStateManager.getState(-100001, 1001)).toBeNull();
      // User 9999's state untouched
      expect(expenseStateManager.getState(-100001, 9999)).not.toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────
  // 8. Expense history formatting with special chars
  // ──────────────────────────────────────────────────────────
  describe('Expense history — markdown safety', () => {
    it('escapes special characters in expense description', () => {
      const result = formatExpenseHistoryMessage({
        expenses: [
          {
            id: 'exp-1',
            description: 'Dinner_*test[link',
            totalAmount: 120000,
            currency: 'INR',
            paidByUserId: 'u-1',
            payerName: 'Alice_Name',
            expenseDate: '2026-09-19T10:00:00Z',
            createdAt: '2026-09-19T10:00:00Z',
          },
        ],
        totalCount: 1,
        page: 1,
        totalPages: 1,
        pageSize: 5,
      });

      // Description should be escaped
      expect(result).toContain('Dinner\\_\\*test\\[link');
      // Payer name should be escaped
      expect(result).toContain('Alice\\_Name');
    });
  });
});
