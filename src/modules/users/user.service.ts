import { UserRepository } from '../../db/repositories/users.repository';
import { User } from './index';

export interface TelegramUserData {
  id: number;
  first_name: string;
  last_name?: string | null;
  username?: string | null;
}

export class UserService {
  constructor(private readonly userRepo: UserRepository) {}

  async registerUser(data: TelegramUserData): Promise<User> {
    const row = await this.userRepo.upsertByTelegramId({
      telegram_user_id: data.id,
      first_name: data.first_name,
      last_name: data.last_name ?? null,
      username: data.username ?? null,
    });

    return {
      id: row.id,
      telegramUserId: row.telegram_user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      username: row.username,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async getUserById(id: string): Promise<User | null> {
    const row = await this.userRepo.findById(id);
    if (!row) return null;

    return {
      id: row.id,
      telegramUserId: row.telegram_user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      username: row.username,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async getUserByTelegramId(telegramId: number): Promise<User | null> {
    const row = await this.userRepo.findByTelegramId(telegramId);
    if (!row) return null;

    return {
      id: row.id,
      telegramUserId: row.telegram_user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      username: row.username,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
