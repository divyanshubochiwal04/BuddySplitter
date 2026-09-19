import { describe, it, expect, vi } from 'vitest';
import { GroupService } from './group.service';
import { GroupRepository } from '../../db/repositories/groups.repository';
import { GroupMemberRepository } from '../../db/repositories/group-members.repository';

describe('GroupService', () => {
  it('registers a group and falls back to Unnamed Group when title is missing', async () => {
    const mockGroupRepo = {
      upsertByTelegramChatId: vi.fn().mockResolvedValue({
        id: 'grp-1',
        telegram_chat_id: -100111222,
        title: 'Unnamed Group',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      findById: vi.fn(),
      findByTelegramChatId: vi.fn(),
    } as unknown as GroupRepository;

    const mockMemberRepo = {} as unknown as GroupMemberRepository;

    const service = new GroupService(mockGroupRepo, mockMemberRepo);
    const group = await service.registerGroup({ id: -100111222 });

    expect(group.id).toBe('grp-1');
    expect(group.title).toBe('Unnamed Group');
    expect(mockGroupRepo.upsertByTelegramChatId).toHaveBeenCalledWith({
      telegram_chat_id: -100111222,
      title: 'Unnamed Group',
    });
  });

  it('registers and retrieves active group members', async () => {
    const mockGroupRepo = {} as unknown as GroupRepository;
    const mockMemberRepo = {
      addOrActivateMember: vi.fn().mockResolvedValue({
        id: 'gm-1',
        group_id: 'grp-1',
        user_id: 'usr-1',
        display_name: 'Alice',
        joined_at: new Date().toISOString(),
        is_active: true,
      }),
      findActiveMembersByGroupId: vi.fn().mockResolvedValue([
        {
          id: 'gm-1',
          group_id: 'grp-1',
          user_id: 'usr-1',
          display_name: 'Alice',
          joined_at: new Date().toISOString(),
          is_active: true,
        },
      ]),
    } as unknown as GroupMemberRepository;

    const service = new GroupService(mockGroupRepo, mockMemberRepo);
    const member = await service.registerMember('grp-1', 'usr-1', 'Alice');
    expect(member.displayName).toBe('Alice');
    expect(member.isActive).toBe(true);

    const members = await service.getActiveMembers('grp-1');
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe('usr-1');
  });
});
