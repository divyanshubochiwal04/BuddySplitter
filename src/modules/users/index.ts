/**
 * Users Module
 *
 * Encapsulates user domain entities and user business logic.
 */

export interface User {
  id: string;
  telegramUserId: number;
  username?: string | null;
  firstName: string;
  lastName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export * from './user.service';
