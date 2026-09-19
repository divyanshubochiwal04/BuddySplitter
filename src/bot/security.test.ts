import { describe, it, expect, beforeEach, vi } from 'vitest';
import { safeErrorMessage, ValidationError, NotFoundError } from '../shared/errors';
import { escapeMarkdown } from '../shared/markdown';
import { RateLimiter } from '../shared/rate-limiter';
import { expenseStateManager } from '../modules/expenses/expense-state';
import { paymentStateManager } from '../modules/settlements/payment-state';
import { parseAndValidateAmount, validateDescription } from '../modules/expenses/expense-validation';
import { createCallbackRouter } from './callbacks/router';
import { handlePrivacy } from './commands/privacy';
import { createMyDataCommandHandler } from './commands/my-data';
import { createDeleteDataCommandHandler } from './commands/delete-data';
import { BotServices } from '../modules/services';
import { Context } from 'grammy';

describe('Phase 11 — Security & Compliance Test Suite', () => {
  // ──────────────────────────────────────────────────────────
  // 1. Error Security & Leakage Prevention
  // ──────────────────────────────────────────────────────────
  describe('Error Security', () => {
    it('sanitizes unexpected database/internal errors from end-users', () => {
      const sqlError = new Error('syntax error at or near "SELECT" table "users"');
      const safe = safeErrorMessage(sqlError);
      expect(safe).not.toContain('SELECT');
      expect(safe).not.toContain('users');
      expect(safe).toBe('Unable to complete your request. Please try again later.');
    });

    it('sanitizes Supabase / PostgreSQL connection errors', () => {
      const dbConnError = new Error('PostgREST error: connection to server at "db.xyz.supabase.co" failed');
      const safe = safeErrorMessage(dbConnError);
      expect(safe).not.toContain('supabase.co');
      expect(safe).not.toContain('PostgREST');
      expect(safe).toBe('Unable to complete your request. Please try again later.');
    });

    it('preserves user-facing validation errors safely', () => {
      const valError = new ValidationError('Please enter a valid amount');
      expect(safeErrorMessage(valError)).toBe('Please enter a valid amount');
    });

    it('preserves not-found messages safely', () => {
      const nfError = new NotFoundError('Expense not found.');
      expect(safeErrorMessage(nfError)).toBe('Expense not found.');
    });
  });

  // ──────────────────────────────────────────────────────────
  // 2. Input Validation & Money Safety
  // ──────────────────────────────────────────────────────────
  describe('Input Validation & Money Safety', () => {
    it('rejects negative amounts', () => {
      expect(() => parseAndValidateAmount('-500')).toThrow(ValidationError);
    });

    it('rejects zero amount', () => {
      expect(() => parseAndValidateAmount('0')).toThrow(ValidationError);
    });

    it('rejects NaN and non-numeric strings', () => {
      expect(() => parseAndValidateAmount('abc')).toThrow(ValidationError);
      expect(() => parseAndValidateAmount('NaN')).toThrow(ValidationError);
      expect(() => parseAndValidateAmount('Infinity')).toThrow(ValidationError);
    });

    it('rejects empty or whitespace-only descriptions', () => {
      expect(() => validateDescription('')).toThrow(ValidationError);
      expect(() => validateDescription('   ')).toThrow(ValidationError);
    });

    it('rejects oversized descriptions exceeding 100 characters', () => {
      const oversized = 'A'.repeat(101);
      expect(() => validateDescription(oversized)).toThrow(ValidationError);
    });
  });


  // ──────────────────────────────────────────────────────────
  // 3. Markdown / Text Injection Protection
  // ──────────────────────────────────────────────────────────
  describe('Markdown / Text Injection Defense', () => {
    it('escapes formatting characters to prevent injection', () => {
      const injected = '*ATTENTION* _all_ `money` [link](http://evil.com)';
      const escaped = escapeMarkdown(injected);

      expect(escaped).toContain('\\*ATTENTION\\*');
      expect(escaped).toContain('\\_all\\_');
      expect(escaped).toContain('\\`money\\`');
      expect(escaped).toContain('\\[link');
    });

    it('safely handles extreme character inputs', () => {
      const attack = '******____`````[[[[[';
      const escaped = escapeMarkdown(attack);
      expect(escaped).toBe('\\*\\*\\*\\*\\*\\*\\_\\_\\_\\_\\`\\`\\`\\`\\`\\[\\[\\[\\[\\[');
    });
  });

  // ──────────────────────────────────────────────────────────
  // 4. Rate Limiting Protection
  // ──────────────────────────────────────────────────────────
  describe('Rate Limiting', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
      limiter = new RateLimiter();
    });

    it('allows permitted burst requests', () => {
      const res = limiter.check('user:action', 5, 10000);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(4);
    });

    it('blocks excessive requests beyond threshold', () => {
      for (let i = 0; i < 5; i++) {
        limiter.check('spammer', 5, 10000);
      }
      const blocked = limiter.check('spammer', 5, 10000);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('maintains strict user isolation under rate limiting', () => {
      for (let i = 0; i < 5; i++) {
        limiter.check('victim', 5, 10000);
      }
      expect(limiter.check('victim', 5, 10000).allowed).toBe(false);
      expect(limiter.check('innocent_user', 5, 10000).allowed).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────
  // 5. State Isolation & Expiration
  // ──────────────────────────────────────────────────────────
  describe('State Isolation & TTL', () => {
    beforeEach(() => {
      expenseStateManager.clearAll();
      paymentStateManager.clearAll();
    });

    it('strictly isolates expense state by chatId and userId', () => {
      expenseStateManager.setState({
        chatId: 100,
        userId: 1,
        groupId: 'g-1',
        creatorUserId: 'u-1',
        step: 'AWAITING_DESCRIPTION',
        participantUserIds: [],
        splits: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // User 2 in Chat 100 should not see User 1's draft
      expect(expenseStateManager.getState(100, 2)).toBeNull();
      // User 1 in Chat 200 should not see Chat 100's draft
      expect(expenseStateManager.getState(200, 1)).toBeNull();
      // User 1 in Chat 100 sees their draft
      expect(expenseStateManager.getState(100, 1)).not.toBeNull();
    });

    it('expires draft after TTL', () => {
      vi.useFakeTimers();
      try {
        expenseStateManager.setState({
          chatId: 100,
          userId: 1,
          groupId: 'g-1',
          creatorUserId: 'u-1',
          step: 'AWAITING_DESCRIPTION',
          participantUserIds: [],
          splits: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        expect(expenseStateManager.getState(100, 1)).not.toBeNull();

        // Advance past 15-min TTL
        vi.advanceTimersByTime(16 * 60 * 1000);

        expect(expenseStateManager.getState(100, 1)).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ──────────────────────────────────────────────────────────
  // 6. Callback Security & Replay Prevention
  // ──────────────────────────────────────────────────────────
  describe('Callback Security', () => {
    it('handles malformed callback data safely without throwing unhandled exceptions', async () => {
      const replyMock = vi.fn().mockResolvedValue(undefined);
      const answerMock = vi.fn().mockResolvedValue(undefined);

      const router = createCallbackRouter({} as BotServices);

      const mockCtx = {
        callbackQuery: { data: 'invalid_malformed_action_data_not_in_system' },
        reply: replyMock,
        answerCallbackQuery: answerMock,
      } as unknown as Context;

      await router(mockCtx);

      expect(answerMock).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('Unrecognized') })
      );
    });

    it('prevents user A from confirming data deletion for user B', async () => {
      const answerMock = vi.fn().mockResolvedValue(undefined);
      const router = createCallbackRouter({} as BotServices);

      const mockCtx = {
        callbackQuery: { data: 'deldata:confirm:999' },
        from: { id: 111 }, // Different user trying to confirm user 999's deletion
        chat: { id: -100 },
        answerCallbackQuery: answerMock,
      } as unknown as Context;

      await router(mockCtx);

      expect(answerMock).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('cannot confirm data deletion for another user'),
          show_alert: true,
        })
      );
    });

    it('prevents user A from cancelling data deletion for user B', async () => {
      const answerMock = vi.fn().mockResolvedValue(undefined);
      const router = createCallbackRouter({} as BotServices);

      const mockCtx = {
        callbackQuery: { data: 'deldata:cancel:999' },
        from: { id: 111 },
        chat: { id: -100 },
        answerCallbackQuery: answerMock,
      } as unknown as Context;

      await router(mockCtx);

      expect(answerMock).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('cannot cancel this action for another user'),
          show_alert: true,
        })
      );
    });
  });

  // ──────────────────────────────────────────────────────────
  // 7. Privacy Commands (/privacy, /my_data, /delete_my_data)
  // ──────────────────────────────────────────────────────────
  describe('Privacy Commands', () => {
    it('/privacy displays fallback when PRIVACY_POLICY_URL is unset', async () => {
      const originalEnv = process.env.PRIVACY_POLICY_URL;
      delete process.env.PRIVACY_POLICY_URL;

      const replyMock = vi.fn().mockResolvedValue(undefined);
      const mockCtx = {
        from: { id: 123 },
        reply: replyMock,
      } as unknown as Context;

      await handlePrivacy(mockCtx);

      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('privacy policy URL is not configured yet'),
        expect.any(Object)
      );

      process.env.PRIVACY_POLICY_URL = originalEnv;
    });

    it('/privacy provides link when PRIVACY_POLICY_URL is set', async () => {
      process.env.PRIVACY_POLICY_URL = 'https://example.com/privacy';

      const replyMock = vi.fn().mockResolvedValue(undefined);
      const mockCtx = {
        from: { id: 123 },
        reply: replyMock,
      } as unknown as Context;

      await handlePrivacy(mockCtx);

      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('https://example.com/privacy'),
        expect.any(Object)
      );

      delete process.env.PRIVACY_POLICY_URL;
    });

    it('/my_data exports user data accurately without exposing internal DB tokens', async () => {
      const mockServices = {
        userService: {
          getUserDataExport: vi.fn().mockResolvedValue({
            telegramUserId: 555,
            name: 'Alice Smith',
            username: 'alice',
            registeredAt: new Date('2026-09-01T00:00:00Z'),
            activeGroupsCount: 2,
            expensesCreatedCount: 5,
            expensesPaidCount: 4,
            settlementsCount: 3,
          }),
        },
      } as unknown as BotServices;

      const replyMock = vi.fn().mockResolvedValue(undefined);
      const handler = createMyDataCommandHandler(mockServices);

      const mockCtx = {
        from: { id: 555 },
        reply: replyMock,
      } as unknown as Context;

      await handler(mockCtx);

      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('Alice Smith'),
        expect.any(Object)
      );
      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('555'),
        expect.any(Object)
      );
      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('/delete\\_my\\_data'),
        expect.any(Object)
      );
    });

    it('/delete_my_data prompts for confirmation with distinct deletion/retention explanations', async () => {
      const mockServices = {
        userService: {
          getUserByTelegramId: vi.fn().mockResolvedValue({
            id: 'uuid-1',
            telegramUserId: 777,
            firstName: 'Bob',
          }),
        },
      } as unknown as BotServices;

      const replyMock = vi.fn().mockResolvedValue(undefined);
      const handler = createDeleteDataCommandHandler(mockServices);

      const mockCtx = {
        from: { id: 777 },
        reply: replyMock,
      } as unknown as Context;

      await handler(mockCtx);

      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('What will be deleted / anonymized:'),
        expect.objectContaining({
          reply_markup: expect.anything(),
        })
      );
      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('What will be retained for accounting integrity:'),
        expect.any(Object)
      );
    });
  });
});
