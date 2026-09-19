import { describe, it, expect, vi } from 'vitest';
import { UserService } from './user.service';
import { UserRepository } from '../../db/repositories/users.repository';

describe('UserService', () => {
  it('registers a user with full details', async () => {
    const mockRepo = {
      upsertByTelegramId: vi.fn().mockResolvedValue({
        id: 'usr-1',
        telegram_user_id: 123456,
        first_name: 'John',
        last_name: 'Doe',
        username: 'johndoe',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      findById: vi.fn(),
      findByTelegramId: vi.fn(),
    } as unknown as UserRepository;

    const service = new UserService(mockRepo);
    const user = await service.registerUser({
      id: 123456,
      first_name: 'John',
      last_name: 'Doe',
      username: 'johndoe',
    });

    expect(user.id).toBe('usr-1');
    expect(user.telegramUserId).toBe(123456);
    expect(user.firstName).toBe('John');
    expect(user.lastName).toBe('Doe');
    expect(user.username).toBe('johndoe');
    expect(mockRepo.upsertByTelegramId).toHaveBeenCalledWith({
      telegram_user_id: 123456,
      first_name: 'John',
      last_name: 'Doe',
      username: 'johndoe',
    });
  });

  it('registers a user without username or last_name', async () => {
    const mockRepo = {
      upsertByTelegramId: vi.fn().mockResolvedValue({
        id: 'usr-2',
        telegram_user_id: 789012,
        first_name: 'Bob',
        last_name: null,
        username: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      findById: vi.fn(),
      findByTelegramId: vi.fn(),
    } as unknown as UserRepository;

    const service = new UserService(mockRepo);
    const user = await service.registerUser({
      id: 789012,
      first_name: 'Bob',
    });

    expect(user.id).toBe('usr-2');
    expect(user.lastName).toBeNull();
    expect(user.username).toBeNull();
    expect(mockRepo.upsertByTelegramId).toHaveBeenCalledWith({
      telegram_user_id: 789012,
      first_name: 'Bob',
      last_name: null,
      username: null,
    });
  });
});
