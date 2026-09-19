import { GroupRepository } from '../../db/repositories/groups.repository';
import { GroupMemberRepository } from '../../db/repositories/group-members.repository';
import { Group, GroupMember } from './index';

export interface TelegramChatData {
  id: number;
  title?: string | null;
}

export class GroupService {
  constructor(
    private readonly groupRepo: GroupRepository,
    private readonly groupMemberRepo: GroupMemberRepository
  ) {}

  async registerGroup(chat: TelegramChatData): Promise<Group> {
    const title = chat.title?.trim() || 'Unnamed Group';
    const row = await this.groupRepo.upsertByTelegramChatId({
      telegram_chat_id: chat.id,
      title,
    });

    return {
      id: row.id,
      telegramChatId: row.telegram_chat_id,
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async registerMember(
    groupId: string,
    userId: string,
    displayName?: string | null
  ): Promise<GroupMember> {
    const row = await this.groupMemberRepo.addOrActivateMember({
      group_id: groupId,
      user_id: userId,
      display_name: displayName ?? null,
    });

    return {
      id: row.id,
      groupId: row.group_id,
      userId: row.user_id,
      displayName: row.display_name,
      joinedAt: new Date(row.joined_at),
      isActive: row.is_active,
    };
  }

  async getActiveMembers(groupId: string): Promise<GroupMember[]> {
    const rows = await this.groupMemberRepo.findActiveMembersByGroupId(groupId);
    return rows.map((r) => ({
      id: r.id,
      groupId: r.group_id,
      userId: r.user_id,
      displayName: r.display_name,
      joinedAt: new Date(r.joined_at),
      isActive: r.is_active,
    }));
  }

  async setMemberActive(groupId: string, userId: string, isActive: boolean): Promise<GroupMember> {
    const row = await this.groupMemberRepo.setMemberActiveStatus(groupId, userId, isActive);
    return {
      id: row.id,
      groupId: row.group_id,
      userId: row.user_id,
      displayName: row.display_name,
      joinedAt: new Date(row.joined_at),
      isActive: row.is_active,
    };
  }

  async getGroupByTelegramChatId(chatId: number): Promise<Group | null> {
    const row = await this.groupRepo.findByTelegramChatId(chatId);
    if (!row) return null;

    return {
      id: row.id,
      telegramChatId: row.telegram_chat_id,
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async getGroupById(id: string): Promise<Group | null> {
    const row = await this.groupRepo.findById(id);
    if (!row) return null;

    return {
      id: row.id,
      telegramChatId: row.telegram_chat_id,
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
