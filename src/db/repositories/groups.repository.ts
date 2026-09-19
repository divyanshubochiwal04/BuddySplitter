import { SupabaseClient } from '@supabase/supabase-js';
import { Database, GroupRow } from '../types';

export class GroupRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async findById(id: string): Promise<GroupRow | null> {
    const { data, error } = await this.client
      .from('groups')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async findByTelegramChatId(telegramChatId: number): Promise<GroupRow | null> {
    const { data, error } = await this.client
      .from('groups')
      .select('*')
      .eq('telegram_chat_id', telegramChatId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async upsertByTelegramChatId(group: {
    telegram_chat_id: number;
    title: string;
  }): Promise<GroupRow> {
    const { data, error } = await this.client
      .from('groups')
      .upsert(
        {
          telegram_chat_id: group.telegram_chat_id,
          title: group.title,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'telegram_chat_id' }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
