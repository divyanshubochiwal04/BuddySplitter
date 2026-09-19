/**
 * Database Types for BuddySplitter Supabase PostgreSQL Schema
 */

export type SplitType = 'equal' | 'custom' | 'percentage' | 'shares';
export type SettlementStatus = 'pending' | 'paid' | 'cancelled';

export type UserRow = {
  id: string;
  telegram_user_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  created_at: string;
  updated_at: string;
};

export type UserInsert = {
  id?: string;
  telegram_user_id: number;
  username?: string | null;
  first_name: string;
  last_name?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type UserUpdate = {
  telegram_user_id?: number;
  username?: string | null;
  first_name?: string;
  last_name?: string | null;
  updated_at?: string;
};

export type GroupRow = {
  id: string;
  telegram_chat_id: number;
  title: string;
  created_at: string;
  updated_at: string;
};

export type GroupInsert = {
  id?: string;
  telegram_chat_id: number;
  title: string;
  created_at?: string;
  updated_at?: string;
};

export type GroupUpdate = {
  telegram_chat_id?: number;
  title?: string;
  updated_at?: string;
};

export type GroupMemberRow = {
  id: string;
  group_id: string;
  user_id: string;
  display_name: string | null;
  joined_at: string;
  is_active: boolean;
};

export type GroupMemberInsert = {
  id?: string;
  group_id: string;
  user_id: string;
  display_name?: string | null;
  joined_at?: string;
  is_active?: boolean;
};

export type GroupMemberUpdate = {
  display_name?: string | null;
  is_active?: boolean;
};

export type ExpenseRow = {
  id: string;
  group_id: string;
  description: string;
  category: string;
  total_amount: number; // Stored in minor units (paise)
  currency: string;
  paid_by: string;
  created_by: string;
  split_type: SplitType;
  expense_date: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ExpenseInsert = {
  id?: string;
  group_id: string;
  description: string;
  category?: string;
  total_amount: number; // minor units (paise)
  currency?: string;
  paid_by: string;
  created_by: string;
  split_type: SplitType;
  expense_date?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type ExpenseUpdate = {
  description?: string;
  category?: string;
  total_amount?: number;
  currency?: string;
  paid_by?: string;
  split_type?: SplitType;
  expense_date?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type ExpenseSplitRow = {
  id: string;
  expense_id: string;
  user_id: string;
  amount: number; // Stored in minor units (paise)
  percentage: number | null;
  shares: number | null;
  created_at: string;
};

export type ExpenseSplitInsert = {
  id?: string;
  expense_id: string;
  user_id: string;
  amount: number; // minor units (paise)
  percentage?: number | null;
  shares?: number | null;
  created_at?: string;
};

export type ExpenseSplitUpdate = {
  amount?: number;
  percentage?: number | null;
  shares?: number | null;
};

export type SettlementRow = {
  id: string;
  group_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number; // Stored in minor units (paise)
  currency: string;
  status: SettlementStatus;
  created_by: string;
  settled_at: string | null;
  created_at: string;
};

export type SettlementInsert = {
  id?: string;
  group_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number; // minor units (paise)
  currency?: string;
  status?: SettlementStatus;
  created_by: string;
  settled_at?: string | null;
  created_at?: string;
};

export type SettlementUpdate = {
  status?: SettlementStatus;
  settled_at?: string | null;
};

/**
 * Supabase Database interface representation compliant with GenericSchema
 */
export type Database = {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: UserInsert;
        Update: UserUpdate;
        Relationships: [];
      };
      groups: {
        Row: GroupRow;
        Insert: GroupInsert;
        Update: GroupUpdate;
        Relationships: [];
      };
      group_members: {
        Row: GroupMemberRow;
        Insert: GroupMemberInsert;
        Update: GroupMemberUpdate;
        Relationships: [];
      };
      expenses: {
        Row: ExpenseRow;
        Insert: ExpenseInsert;
        Update: ExpenseUpdate;
        Relationships: [];
      };
      expense_splits: {
        Row: ExpenseSplitRow;
        Insert: ExpenseSplitInsert;
        Update: ExpenseSplitUpdate;
        Relationships: [];
      };
      settlements: {
        Row: SettlementRow;
        Insert: SettlementInsert;
        Update: SettlementUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
