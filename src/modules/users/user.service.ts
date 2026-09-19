import { UserRepository } from '../../db/repositories/users.repository';
import { GroupMemberRepository } from '../../db/repositories/group-members.repository';
import { ExpenseRepository } from '../../db/repositories/expenses.repository';
import { SettlementRepository } from '../../db/repositories/settlements.repository';
import { User } from './index';

export interface TelegramUserData {
  id: number;
  first_name: string;
  last_name?: string | null;
  username?: string | null;
}

export interface UserDataExport {
  telegramUserId: number;
  name: string;
  username: string | null;
  registeredAt: Date;
  activeGroupsCount: number;
  expensesCreatedCount: number;
  expensesPaidCount: number;
  settlementsCount: number;
}

export class UserService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly groupMemberRepo?: GroupMemberRepository,
    private readonly expenseRepo?: ExpenseRepository,
    private readonly settlementRepo?: SettlementRepository
  ) {}


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

  async anonymizeUser(telegramUserId: number): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepo.findByTelegramId(telegramUserId);
    if (!user) {
      return { success: false, message: 'User record not found.' };
    }

    // 1. Anonymize user personal identity
    await this.userRepo.anonymizeUser(telegramUserId);

    // 2. Anonymize group memberships
    if (this.groupMemberRepo) {
      await this.groupMemberRepo.anonymizeMemberForUser(user.id);
    }

    return {
      success: true,
      message:
        'Your personal profile data has been safely anonymized. Financial transaction history has been preserved without personal identifiers to maintain shared group accounting integrity.',
    };
  }

  async getUserDataExport(telegramUserId: number): Promise<UserDataExport | null> {
    const user = await this.userRepo.findByTelegramId(telegramUserId);
    if (!user) return null;

    const activeGroupsCount = this.groupMemberRepo
      ? await this.groupMemberRepo.countGroupsByUserId(user.id)
      : 0;

    const expensesCreatedCount = this.expenseRepo
      ? await this.userRepo.countExpensesCreatedByUser(user.id)
      : 0;

    const expensesPaidCount = this.expenseRepo
      ? await this.userRepo.countExpensesPaidByUser(user.id)
      : 0;

    const settlementsCount = this.settlementRepo
      ? await this.settlementRepo.countSettlementsByUser(user.id)
      : 0;

    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.first_name;

    return {
      telegramUserId: user.telegram_user_id,
      name: fullName,
      username: user.username,
      registeredAt: new Date(user.created_at),
      activeGroupsCount,
      expensesCreatedCount,
      expensesPaidCount,
      settlementsCount,
    };
  }
}

