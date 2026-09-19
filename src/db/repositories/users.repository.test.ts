import { describe, it, expect, vi } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types';
import { UserRepository } from './users.repository';

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

describe('UserRepository', () => {
  it('finds user by internal UUID', async () => {
    const { client, queryBuilder } = createMockClient();
    const mockUser = {
      id: 'usr-123',
      telegram_user_id: 999111,
      username: 'john_doe',
      first_name: 'John',
      last_name: 'Doe',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    queryBuilder.maybeSingle.mockResolvedValue({ data: mockUser, error: null });

    const repo = new UserRepository(client);
    const result = await repo.findById('usr-123');

    expect(client.from).toHaveBeenCalledWith('users');
    expect(queryBuilder.select).toHaveBeenCalledWith('*');
    expect(queryBuilder.eq).toHaveBeenCalledWith('id', 'usr-123');
    expect(result).toEqual(mockUser);
  });

  it('finds user by Telegram User ID', async () => {
    const { client, queryBuilder } = createMockClient();
    queryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

    const repo = new UserRepository(client);
    const result = await repo.findByTelegramId(888222);

    expect(client.from).toHaveBeenCalledWith('users');
    expect(queryBuilder.eq).toHaveBeenCalledWith('telegram_user_id', 888222);
    expect(result).toBeNull();
  });

  it('upserts user by Telegram User ID', async () => {
    const { client, queryBuilder } = createMockClient();
    const mockCreated = {
      id: 'usr-456',
      telegram_user_id: 777333,
      username: 'alice',
      first_name: 'Alice',
      last_name: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    queryBuilder.single.mockResolvedValue({ data: mockCreated, error: null });

    const repo = new UserRepository(client);
    const result = await repo.upsertByTelegramId({
      telegram_user_id: 777333,
      first_name: 'Alice',
      username: 'alice',
    });

    expect(client.from).toHaveBeenCalledWith('users');
    expect(queryBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        telegram_user_id: 777333,
        first_name: 'Alice',
      }),
      { onConflict: 'telegram_user_id' }
    );
    expect(result).toEqual(mockCreated);
  });
});
