import { describe, it, expect, vi } from 'vitest';
import { createBalanceCommandHandler } from './balance';
import { createSummaryCommandHandler } from './summary';
import { createCallbackRouter } from '../callbacks/router';
import { BotServices } from '../../modules/services';
import { Context } from 'grammy';
import { UserPersonalBalance, GroupBalanceSummary } from '../../modules/balances/balance.types';

describe('Balance and Summary Bot Commands & Callbacks', () => {
  const mockUserBalance: UserPersonalBalance = {
    userId: 'u-1',
    displayName: 'Alice',
    paidAmount: 30000,
    owedAmount: 10000,
    netBalance: 20000,
    category: 'creditor',
  };

  const mockGroupSummary: GroupBalanceSummary = {
    groupId: 'grp-1',
    totalExpensesCount: 1,
    totalExpensesAmount: 30000,
    creditors: [mockUserBalance],
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
    settled: [],
    allBalances: [mockUserBalance],
  };

  const mockBalanceService = {
    getUserBalanceForTelegram: vi.fn(),
    getGroupSummaryForTelegram: vi.fn(),
  };

  const services = {
    balanceService: mockBalanceService,
    groupService: {},
    userService: {},
    expenseService: {},
  } as unknown as BotServices;

  describe('/balance command', () => {
    it('rejects execution when invoked in private chat', async () => {
      const replyMock = vi.fn().mockResolvedValue(undefined);
      const ctx = {
        chat: { type: 'private', id: 123 },
        from: { id: 123 },
        reply: replyMock,
      } as unknown as Context;

      const handler = createBalanceCommandHandler(services);
      await handler(ctx);

      expect(replyMock).toHaveBeenCalledWith('⚠️ Balance is available inside a group.');
      expect(mockBalanceService.getUserBalanceForTelegram).not.toHaveBeenCalled();
    });

    it('returns personal balance in group chat', async () => {
      vi.mocked(mockBalanceService.getUserBalanceForTelegram).mockResolvedValue(mockUserBalance);
      const replyMock = vi.fn().mockResolvedValue(undefined);
      const ctx = {
        chat: { type: 'group', id: -1001 },
        from: { id: 111 },
        reply: replyMock,
      } as unknown as Context;

      const handler = createBalanceCommandHandler(services);
      await handler(ctx);

      expect(mockBalanceService.getUserBalanceForTelegram).toHaveBeenCalledWith(-1001, 111);
      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('💰 *Your Balance*'),
        { parse_mode: 'Markdown' }
      );
      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('🟢 *You should receive:* ₹200.00'),
        { parse_mode: 'Markdown' }
      );
    });

    it('handles errors gracefully in group chat', async () => {
      vi.mocked(mockBalanceService.getUserBalanceForTelegram).mockRejectedValue(
        new Error('Group is not registered.')
      );
      const replyMock = vi.fn().mockResolvedValue(undefined);
      const ctx = {
        chat: { type: 'supergroup', id: -1001 },
        from: { id: 111 },
        reply: replyMock,
      } as unknown as Context;

      const handler = createBalanceCommandHandler(services);
      await handler(ctx);

      expect(replyMock).toHaveBeenCalledWith('⚠️ Group is not registered.');
    });
  });

  describe('/summary command', () => {
    it('rejects execution when invoked in private chat', async () => {
      const replyMock = vi.fn().mockResolvedValue(undefined);
      const ctx = {
        chat: { type: 'private', id: 123 },
        from: { id: 123 },
        reply: replyMock,
      } as unknown as Context;

      const handler = createSummaryCommandHandler(services);
      await handler(ctx);

      expect(replyMock).toHaveBeenCalledWith('⚠️ Group summary is available inside a group.');
      expect(mockBalanceService.getGroupSummaryForTelegram).not.toHaveBeenCalled();
    });

    it('returns group summary in group chat', async () => {
      vi.mocked(mockBalanceService.getGroupSummaryForTelegram).mockResolvedValue(mockGroupSummary);
      const replyMock = vi.fn().mockResolvedValue(undefined);
      const ctx = {
        chat: { type: 'group', id: -1001 },
        from: { id: 111 },
        reply: replyMock,
      } as unknown as Context;

      const handler = createSummaryCommandHandler(services);
      await handler(ctx);

      expect(mockBalanceService.getGroupSummaryForTelegram).toHaveBeenCalledWith(-1001, 111);
      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('📊 *Group Summary*'),
        { parse_mode: 'Markdown' }
      );
      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('🟢 Alice receives ₹200.00'),
        { parse_mode: 'Markdown' }
      );
      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('🔴 Bob owes ₹200.00'),
        { parse_mode: 'Markdown' }
      );
    });

    it('handles errors gracefully in group chat', async () => {
      vi.mocked(mockBalanceService.getGroupSummaryForTelegram).mockRejectedValue(
        new Error('Database unavailable')
      );
      const replyMock = vi.fn().mockResolvedValue(undefined);
      const ctx = {
        chat: { type: 'supergroup', id: -1001 },
        from: { id: 111 },
        reply: replyMock,
      } as unknown as Context;

      const handler = createSummaryCommandHandler(services);
      await handler(ctx);

      expect(replyMock).toHaveBeenCalledWith('⚠️ Database unavailable');
    });
  });

  describe('Callback Router integration', () => {
    it('handles action:my_balance callback', async () => {
      vi.mocked(mockBalanceService.getUserBalanceForTelegram).mockResolvedValue(mockUserBalance);
      const answerCallbackQueryMock = vi.fn().mockResolvedValue(true);
      const replyMock = vi.fn().mockResolvedValue(undefined);

      const ctx = {
        callbackQuery: { data: 'action:my_balance' },
        chat: { id: -1001, type: 'group' },
        from: { id: 111 },
        answerCallbackQuery: answerCallbackQueryMock,
        reply: replyMock,
      } as unknown as Context;

      const router = createCallbackRouter(services);
      await router(ctx);

      expect(answerCallbackQueryMock).toHaveBeenCalled();
      expect(mockBalanceService.getUserBalanceForTelegram).toHaveBeenCalledWith(-1001, 111);
      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('💰 *Your Balance*'),
        expect.objectContaining({
          parse_mode: 'Markdown',
          reply_markup: expect.anything(),
        })
      );
    });

    it('handles action:summary callback', async () => {
      vi.mocked(mockBalanceService.getGroupSummaryForTelegram).mockResolvedValue(mockGroupSummary);
      const answerCallbackQueryMock = vi.fn().mockResolvedValue(true);
      const replyMock = vi.fn().mockResolvedValue(undefined);

      const ctx = {
        callbackQuery: { data: 'action:summary' },
        chat: { id: -1001, type: 'group' },
        from: { id: 111 },
        answerCallbackQuery: answerCallbackQueryMock,
        reply: replyMock,
      } as unknown as Context;

      const router = createCallbackRouter(services);
      await router(ctx);

      expect(answerCallbackQueryMock).toHaveBeenCalled();
      expect(mockBalanceService.getGroupSummaryForTelegram).toHaveBeenCalledWith(-1001, 111);
      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('📊 *Group Summary*'),
        expect.objectContaining({
          parse_mode: 'Markdown',
          reply_markup: expect.anything(),
        })
      );
    });
  });
});
