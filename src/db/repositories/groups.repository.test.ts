import { describe, it, expect, vi } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types';
import { GroupRepository } from './groups.repository';

function createMockClient() {
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    upsert: vi.fn().mockReturnThis(),
  };

  const client = {
    from: vi.fn().mockReturnValue(queryBuilder),
  } as unknown as SupabaseClient<Database>;

  return { client, queryBuilder };
}

describe('GroupRepository', () => {
  it('finds group by internal UUID', async () => {
    const { client, queryBuilder } = createMockClient();
    const mockGroup = {
      id: 'grp-123',
      telegram_chat_id: -1001234567890,
      title: 'Trip to Goa',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    queryBuilder.maybeSingle.mockResolvedValue({ data: mockGroup, error: null });

    const repo = new GroupRepository(client);
    const result = await repo.findById('grp-123');

    expect(client.from).toHaveBeenCalledWith('groups');
    expect(queryBuilder.eq).toHaveBeenCalledWith('id', 'grp-123');
    expect(result).toEqual(mockGroup);
  });

  it('finds group by Telegram Chat ID', async () => {
    const { client, queryBuilder } = createMockClient();
    queryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

    const repo = new GroupRepository(client);
    const result = await repo.findByTelegramChatId(-100987654321);

    expect(client.from).toHaveBeenCalledWith('groups');
    expect(queryBuilder.eq).toHaveBeenCalledWith('telegram_chat_id', -100987654321);
    expect(result).toBeNull();
  });

  it('upserts group by Telegram Chat ID', async () => {
    const { client, queryBuilder } = createMockClient();
    const mockCreated = {
      id: 'grp-456',
      telegram_chat_id: -100555666777,
      title: 'Flatmates',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    queryBuilder.single.mockResolvedValue({ data: mockCreated, error: null });

    const repo = new GroupRepository(client);
    const result = await repo.upsertByTelegramChatId({
      telegram_chat_id: -100555666777,
      title: 'Flatmates',
    });

    expect(client.from).toHaveBeenCalledWith('groups');
    expect(queryBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        telegram_chat_id: -100555666777,
        title: 'Flatmates',
      }),
      { onConflict: 'telegram_chat_id' }
    );
    expect(result).toEqual(mockCreated);
  });
});
