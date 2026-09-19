import { SupabaseClient } from '@supabase/supabase-js';
import { Database, UserRow } from '../types';

export class UserRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async findById(id: string): Promise<UserRow | null> {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async findByTelegramId(telegramUserId: number): Promise<UserRow | null> {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('telegram_user_id', telegramUserId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async upsertByTelegramId(user: {
    telegram_user_id: number;
    first_name: string;
    last_name?: string | null;
    username?: string | null;
  }): Promise<UserRow> {
    const { data, error } = await this.client
      .from('users')
      .upsert(
        {
          telegram_user_id: user.telegram_user_id,
          first_name: user.first_name,
          last_name: user.last_name ?? null,
          username: user.username ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'telegram_user_id' }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async anonymizeUser(telegramUserId: number): Promise<UserRow | null> {
    const { data, error } = await this.client
      .from('users')
      .update({
        first_name: 'Deleted User',
        last_name: null,
        username: null,
        updated_at: new Date().toISOString(),
      })
      .eq('telegram_user_id', telegramUserId)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async countExpensesCreatedByUser(userId: string): Promise<number> {
    const { count, error } = await this.client
      .from('expenses')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', userId)
      .is('deleted_at', null);

    if (error) throw error;
    return count ?? 0;
  }

  async countExpensesPaidByUser(userId: string): Promise<number> {
    const { count, error } = await this.client
      .from('expenses')
      .select('*', { count: 'exact', head: true })
      .eq('paid_by', userId)
      .is('deleted_at', null);

    if (error) throw error;
    return count ?? 0;
  }
}

