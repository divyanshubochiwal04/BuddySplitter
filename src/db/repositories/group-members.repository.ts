import { SupabaseClient } from '@supabase/supabase-js';
import { Database, GroupMemberRow } from '../types';

export class GroupMemberRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async findByGroupAndUser(groupId: string, userId: string): Promise<GroupMemberRow | null> {
    const { data, error } = await this.client
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async findActiveMembersByGroupId(groupId: string): Promise<GroupMemberRow[]> {
    const { data, error } = await this.client
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .eq('is_active', true)
      .order('joined_at', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  async addOrActivateMember(member: {
    group_id: string;
    user_id: string;
    display_name?: string | null;
  }): Promise<GroupMemberRow> {
    const { data, error } = await this.client
      .from('group_members')
      .upsert(
        {
          group_id: member.group_id,
          user_id: member.user_id,
          display_name: member.display_name ?? null,
          is_active: true,
        },
        { onConflict: 'group_id,user_id' }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async setMemberActiveStatus(
    groupId: string,
    userId: string,
    isActive: boolean
  ): Promise<GroupMemberRow> {
    const { data, error } = await this.client
      .from('group_members')
      .update({ is_active: isActive })
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async anonymizeMemberForUser(userId: string): Promise<void> {
    const { error } = await this.client
      .from('group_members')
      .update({
        display_name: 'Former Member',
        is_active: false,
      })
      .eq('user_id', userId);

    if (error) throw error;
  }

  async countGroupsByUserId(userId: string): Promise<number> {
    const { count, error } = await this.client
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw error;
    return count ?? 0;
  }
}

