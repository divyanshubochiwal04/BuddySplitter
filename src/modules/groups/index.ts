/**
 * Groups Module
 *
 * Encapsulates group domain entities and group membership business logic.
 */

export interface Group {
  id: string;
  telegramChatId: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  displayName?: string | null;
  joinedAt: Date;
  isActive: boolean;
}

export * from './group.service';
