import { describe, it, expect, vi } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types';
import { GroupMemberRepository } from './group-members.repository';

function createMockClient() {
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  };

  const client = {
    from: vi.fn().mockReturnValue(queryBuilder),
  } as unknown as SupabaseClient<Database>;

  return { client, queryBuilder };
}

describe('GroupMemberRepository', () => {
  it('finds active members by group id', async () => {
    const { client, queryBuilder } = createMockClient();
    const mockMembers = [
      {
        id: 'gm-1',
        group_id: 'grp-1',
        user_id: 'usr-1',
        display_name: 'Alice',
        joined_at: new Date().toISOString(),
        is_active: true,
      },
      {
        id: 'gm-2',
        group_id: 'grp-1',
        user_id: 'usr-2',
        display_name: 'Bob',
        joined_at: new Date().toISOString(),
        is_active: true,
      },
    ];

    queryBuilder.order.mockResolvedValue({ data: mockMembers, error: null });

    const repo = new GroupMemberRepository(client);
    const result = await repo.findActiveMembersByGroupId('grp-1');

    expect(client.from).toHaveBeenCalledWith('group_members');
    expect(queryBuilder.eq).toHaveBeenCalledWith('group_id', 'grp-1');
    expect(queryBuilder.eq).toHaveBeenCalledWith('is_active', true);
    expect(result).toHaveLength(2);
  });

  it('adds or reactivates a member', async () => {
    const { client, queryBuilder } = createMockClient();
    const mockRecord = {
      id: 'gm-1',
      group_id: 'grp-1',
      user_id: 'usr-1',
      display_name: 'Alice',
      joined_at: new Date().toISOString(),
      is_active: true,
    };
    queryBuilder.single.mockResolvedValue({ data: mockRecord, error: null });

    const repo = new GroupMemberRepository(client);
    const result = await repo.addOrActivateMember({
      group_id: 'grp-1',
      user_id: 'usr-1',
      display_name: 'Alice',
    });

    expect(queryBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        group_id: 'grp-1',
        user_id: 'usr-1',
        is_active: true,
      }),
      { onConflict: 'group_id,user_id' }
    );
    expect(result).toEqual(mockRecord);
  });

  it('updates member active status', async () => {
    const { client, queryBuilder } = createMockClient();
    const mockRecord = {
      id: 'gm-1',
      group_id: 'grp-1',
      user_id: 'usr-1',
      display_name: 'Alice',
      joined_at: new Date().toISOString(),
      is_active: false,
    };
    queryBuilder.single.mockResolvedValue({ data: mockRecord, error: null });

    const repo = new GroupMemberRepository(client);
    const result = await repo.setMemberActiveStatus('grp-1', 'usr-1', false);

    expect(queryBuilder.update).toHaveBeenCalledWith({ is_active: false });
    expect(result.is_active).toBe(false);
  });
});
