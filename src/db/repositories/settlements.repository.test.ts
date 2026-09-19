import { describe, it, expect, vi } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database, SettlementInsert } from '../types';
import { SettlementRepository } from './settlements.repository';
import { ValidationError } from '../../shared/errors';

function createMockClient() {
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };

  const client = {
    from: vi.fn().mockReturnValue(queryBuilder),
  } as unknown as SupabaseClient<Database>;

  return { client, queryBuilder };
}

describe('SettlementRepository', () => {
  it('creates a settlement record with valid data', async () => {
    const { client, queryBuilder } = createMockClient();
    const mockSettlement = {
      id: 'set-1',
      group_id: 'grp-1',
      from_user_id: 'usr-1',
      to_user_id: 'usr-2',
      amount: 5000, // 5000 paise = ₹50.00
      currency: 'INR',
      status: 'pending' as const,
      created_by: 'usr-1',
      settled_at: null,
      created_at: new Date().toISOString(),
    };
    queryBuilder.single.mockResolvedValue({ data: mockSettlement, error: null });

    const repo = new SettlementRepository(client);
    const payload: SettlementInsert = {
      group_id: 'grp-1',
      from_user_id: 'usr-1',
      to_user_id: 'usr-2',
      amount: 5000,
      currency: 'INR',
      created_by: 'usr-1',
    };

    const result = await repo.create(payload);

    expect(client.from).toHaveBeenCalledWith('settlements');
    expect(result.id).toBe('set-1');
    expect(result.amount).toBe(5000);
    expect(result.status).toBe('pending');
  });

  it('rejects settlement when from_user_id equals to_user_id', async () => {
    const { client } = createMockClient();
    const repo = new SettlementRepository(client);

    const invalidPayload: SettlementInsert = {
      group_id: 'grp-1',
      from_user_id: 'usr-1',
      to_user_id: 'usr-1', // Same user
      amount: 1000,
      created_by: 'usr-1',
    };

    await expect(repo.create(invalidPayload)).rejects.toThrow(
      'from_user_id cannot be the same as to_user_id'
    );
  });

  it('rejects settlement when amount is not a positive integer in minor units', async () => {
    const { client } = createMockClient();
    const repo = new SettlementRepository(client);

    const invalidPayload: SettlementInsert = {
      group_id: 'grp-1',
      from_user_id: 'usr-1',
      to_user_id: 'usr-2',
      amount: 0, // <= 0
      created_by: 'usr-1',
    };

    await expect(repo.create(invalidPayload)).rejects.toThrow(ValidationError);
  });

  it('updates settlement status to paid and records settled_at timestamp', async () => {
    const { client, queryBuilder } = createMockClient();
    const settledTime = new Date('2026-09-19T10:00:00Z');
    const mockUpdated = {
      id: 'set-1',
      status: 'paid' as const,
      settled_at: settledTime.toISOString(),
    };
    queryBuilder.single.mockResolvedValue({ data: mockUpdated, error: null });

    const repo = new SettlementRepository(client);
    const result = await repo.updateStatus('set-1', 'paid', settledTime);

    expect(queryBuilder.update).toHaveBeenCalledWith({
      status: 'paid',
      settled_at: settledTime.toISOString(),
    });
    expect(result.status).toBe('paid');
  });

  it('updates settlement status to cancelled and clears settled_at', async () => {
    const { client, queryBuilder } = createMockClient();
    const mockUpdated = {
      id: 'set-1',
      status: 'cancelled' as const,
      settled_at: null,
    };
    queryBuilder.single.mockResolvedValue({ data: mockUpdated, error: null });

    const repo = new SettlementRepository(client);
    const result = await repo.updateStatus('set-1', 'cancelled');

    expect(queryBuilder.update).toHaveBeenCalledWith({
      status: 'cancelled',
      settled_at: null,
    });
    expect(result.status).toBe('cancelled');
    expect(result.settled_at).toBeNull();
  });

  it('finds paid settlements for a group', async () => {
    const { client, queryBuilder } = createMockClient();
    const mockPaid = [
      { id: 'set-1', group_id: 'grp-1', status: 'paid', amount: 2000 },
    ];
    // query is thenable resolving to { data: mockPaid, error: null }
    queryBuilder.order.mockResolvedValue({ data: mockPaid, error: null });

    const repo = new SettlementRepository(client);
    const result = await repo.findPaidByGroupId('grp-1');

    expect(queryBuilder.eq).toHaveBeenCalledWith('group_id', 'grp-1');
    expect(queryBuilder.eq).toHaveBeenCalledWith('status', 'paid');
    expect(result).toEqual(mockPaid);
  });

  it('finds recent paid settlements with limit', async () => {
    const { client, queryBuilder } = createMockClient();
    const mockRecent = [
      { id: 'set-2', group_id: 'grp-1', status: 'paid', amount: 1500 },
      { id: 'set-1', group_id: 'grp-1', status: 'paid', amount: 2000 },
    ];
    queryBuilder.limit.mockResolvedValue({ data: mockRecent, error: null });

    const repo = new SettlementRepository(client);
    const result = await repo.findRecentPaidByGroupId('grp-1', 5);

    expect(queryBuilder.limit).toHaveBeenCalledWith(5);
    expect(result).toEqual(mockRecent);
  });
});
