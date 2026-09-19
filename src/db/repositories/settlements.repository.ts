import { SupabaseClient } from '@supabase/supabase-js';
import { Database, SettlementInsert, SettlementRow, SettlementStatus } from '../types';
import { ValidationError } from '../../shared/errors';

export class SettlementRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async findById(id: string): Promise<SettlementRow | null> {
    const { data, error } = await this.client
      .from('settlements')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async findByGroupId(groupId: string, status?: SettlementStatus): Promise<SettlementRow[]> {
    let query = this.client
      .from('settlements')
      .select('*')
      .eq('group_id', groupId);

    if (status) {
      query = query.eq('status', status);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async create(data: SettlementInsert): Promise<SettlementRow> {
    if (data.from_user_id === data.to_user_id) {
      throw new ValidationError('from_user_id cannot be the same as to_user_id');
    }

    if (!Number.isInteger(data.amount) || data.amount <= 0) {
      throw new ValidationError('Settlement amount must be a positive integer in minor units');
    }

    const { data: settlement, error } = await this.client
      .from('settlements')
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return settlement;
  }

  async updateStatus(
    id: string,
    status: SettlementStatus,
    settledAt?: Date | null
  ): Promise<SettlementRow> {
    const updatePayload: { status: SettlementStatus; settled_at?: string | null } = {
      status,
    };

    if (status === 'paid') {
      updatePayload.settled_at = settledAt ? settledAt.toISOString() : new Date().toISOString();
    } else if (status === 'pending' || status === 'cancelled') {
      updatePayload.settled_at = null;
    }

    const { data, error } = await this.client
      .from('settlements')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
