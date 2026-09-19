import { describe, it, expect, vi } from 'vitest';
import { Context } from 'grammy';
import { createPaymentsCommandHandler } from './payments';
import { BotServices } from '../../modules/services';

describe('/payments command', () => {
  function createMockContext(chatType: 'group' | 'private' = 'group') {
    return {
      chat: { id: -100123, type: chatType },
      from: { id: 111, first_name: 'Bob' },
      reply: vi.fn(),
    } as unknown as Context;
  }

  it('rejects command in private chats', async () => {
    const ctx = createMockContext('private');
    const mockServices = {} as BotServices;
    const handler = createPaymentsCommandHandler(mockServices);

    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('⚠️ Payment history is available inside a group.');
  });

  it('displays empty message when no payments have been recorded', async () => {
    const ctx = createMockContext('group');
    const mockServices = {
      settlementService: {
        getRecentPaymentsForTelegram: vi.fn().mockResolvedValue({
          payments: [],
          groupTitle: 'Test Group',
        }),
      },
    } as unknown as BotServices;

    const handler = createPaymentsCommandHandler(mockServices);
    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('No payments recorded yet in this group.'),
      expect.objectContaining({ parse_mode: 'Markdown' })
    );
  });

  it('displays formatted payment history when payments exist', async () => {
    const ctx = createMockContext('group');
    const mockPayments = [
      {
        id: 'p-1',
        fromUserId: 'u-bob',
        fromDisplayName: 'Bob',
        toUserId: 'u-alice',
        toDisplayName: 'Alice',
        amount: 50000, // ₹500.00
        currency: 'INR',
        settledAt: '2026-09-19T10:00:00.000Z',
        createdAt: '2026-09-19T10:00:00.000Z',
      },
    ];

    const mockServices = {
      settlementService: {
        getRecentPaymentsForTelegram: vi.fn().mockResolvedValue({
          payments: mockPayments,
          groupTitle: 'Test Group',
        }),
      },
    } as unknown as BotServices;

    const handler = createPaymentsCommandHandler(mockServices);
    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('• *Bob* paid *Alice* ₹500.00'),
      expect.objectContaining({ parse_mode: 'Markdown' })
    );
  });

  it('handles error gracefully when retrieval fails', async () => {
    const ctx = createMockContext('group');
    const mockServices = {
      settlementService: {
        getRecentPaymentsForTelegram: vi.fn().mockRejectedValue(new Error('Database error')),
      },
    } as unknown as BotServices;

    const handler = createPaymentsCommandHandler(mockServices);
    await handler(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('⚠️ Database error');
  });
});
