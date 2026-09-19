import { describe, it, expect, vi } from 'vitest';
import { createSettleCommandHandler } from './settle';
import { createCallbackRouter } from '../callbacks/router';
import { BotServices } from '../../modules/services';
import { Context } from 'grammy';
import { GroupSettlementPlan, UserSettlementSummary } from '../../modules/settlements/settlement.types';

describe('Settlement Bot Commands & Router Callbacks', () => {
  const mockUserSummary: UserSettlementSummary = {
    userId: 'u-1',
    displayName: 'Bob',
    payments: [
      {
        fromUserId: 'u-1',
        fromDisplayName: 'Bob',
        toUserId: 'u-2',
        toDisplayName: 'Alice',
        amount: 120000,
      },
    ],
    receivables: [],
    totalToPay: 120000,
    totalToReceive: 0,
    netBalance: -120000,
    isSettled: false,
  };

  const mockGroupPlan: GroupSettlementPlan = {
    groupId: 'grp-1',
    totalAmount: 120000,
    totalPaymentsCount: 1,
    isSettled: false,
    transactions: [
      {
        fromUserId: 'u-1',
        fromDisplayName: 'Bob',
        toUserId: 'u-2',
        toDisplayName: 'Alice',
        amount: 120000,
      },
    ],
  };

  const mockSettlementService = {
    getUserSettlementSummaryForTelegram: vi.fn(),
    getGroupSettlementPlanForTelegram: vi.fn(),
  };

  const services = {
    settlementService: mockSettlementService,
    balanceService: {},
    groupService: {},
    userService: {},
    expenseService: {},
  } as unknown as BotServices;

  describe('/settle command', () => {
    it('rejects execution when invoked in private chat', async () => {
      const replyMock = vi.fn().mockResolvedValue(undefined);
      const ctx = {
        chat: { type: 'private', id: 123 },
        from: { id: 123 },
        reply: replyMock,
      } as unknown as Context;

      const handler = createSettleCommandHandler(services);
      await handler(ctx);

      expect(replyMock).toHaveBeenCalledWith('⚠️ Settlement is available inside a group.');
      expect(mockSettlementService.getUserSettlementSummaryForTelegram).not.toHaveBeenCalled();
    });

    it('returns user settlements with full plan keyboard in group chat', async () => {
      vi.mocked(mockSettlementService.getUserSettlementSummaryForTelegram).mockResolvedValue({
        userSummary: mockUserSummary,
        groupPlan: mockGroupPlan,
      });

      const replyMock = vi.fn().mockResolvedValue(undefined);
      const ctx = {
        chat: { type: 'group', id: -1001 },
        from: { id: 111 },
        reply: replyMock,
      } as unknown as Context;

      const handler = createSettleCommandHandler(services);
      await handler(ctx);

      expect(mockSettlementService.getUserSettlementSummaryForTelegram).toHaveBeenCalledWith(-1001, 111);
      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('💸 *Your Settlements*'),
        expect.objectContaining({
          parse_mode: 'Markdown',
          reply_markup: expect.anything(),
        })
      );
      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('• Alice — ₹1200.00'),
        expect.anything()
      );
    });

    it('handles errors gracefully in group chat', async () => {
      vi.mocked(mockSettlementService.getUserSettlementSummaryForTelegram).mockRejectedValue(
        new Error('Group not found')
      );

      const replyMock = vi.fn().mockResolvedValue(undefined);
      const ctx = {
        chat: { type: 'supergroup', id: -1001 },
        from: { id: 111 },
        reply: replyMock,
      } as unknown as Context;

      const handler = createSettleCommandHandler(services);
      await handler(ctx);

      expect(replyMock).toHaveBeenCalledWith('⚠️ Group not found');
    });
  });

  describe('Callback Router Integration', () => {
    it('handles action:settle_up callback showing user settlements', async () => {
      vi.mocked(mockSettlementService.getUserSettlementSummaryForTelegram).mockResolvedValue({
        userSummary: mockUserSummary,
        groupPlan: mockGroupPlan,
      });
      const answerCallbackQueryMock = vi.fn().mockResolvedValue(true);
      const replyMock = vi.fn().mockResolvedValue(undefined);

      const ctx = {
        callbackQuery: { data: 'action:settle_up' },
        chat: { id: -1001, type: 'group' },
        from: { id: 111 },
        answerCallbackQuery: answerCallbackQueryMock,
        reply: replyMock,
      } as unknown as Context;

      const router = createCallbackRouter(services);
      await router(ctx);

      expect(answerCallbackQueryMock).toHaveBeenCalled();
      expect(mockSettlementService.getUserSettlementSummaryForTelegram).toHaveBeenCalledWith(-1001, 111);
      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('💸 *Your Settlements*'),
        expect.objectContaining({
          parse_mode: 'Markdown',
          reply_markup: expect.anything(),
        })
      );
    });

    it('handles settle:full callback showing group settlement plan', async () => {
      vi.mocked(mockSettlementService.getGroupSettlementPlanForTelegram).mockResolvedValue(mockGroupPlan);
      const answerCallbackQueryMock = vi.fn().mockResolvedValue(true);
      const replyMock = vi.fn().mockResolvedValue(undefined);

      const ctx = {
        callbackQuery: { data: 'settle:full' },
        chat: { id: -1001, type: 'group' },
        from: { id: 111 },
        answerCallbackQuery: answerCallbackQueryMock,
        reply: replyMock,
      } as unknown as Context;

      const router = createCallbackRouter(services);
      await router(ctx);

      expect(answerCallbackQueryMock).toHaveBeenCalled();
      expect(mockSettlementService.getGroupSettlementPlanForTelegram).toHaveBeenCalledWith(-1001, 111);
      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('💸 *Group Settlement Plan*'),
        expect.objectContaining({
          parse_mode: 'Markdown',
          reply_markup: expect.anything(),
        })
      );
      expect(replyMock).toHaveBeenCalledWith(
        expect.stringContaining('• Bob → Alice ₹1200.00'),
        expect.anything()
      );
    });
  });
});
