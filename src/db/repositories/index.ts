import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types';
import { UserRepository } from './users.repository';
import { GroupRepository } from './groups.repository';
import { GroupMemberRepository } from './group-members.repository';
import { ExpenseRepository } from './expenses.repository';
import { SettlementRepository } from './settlements.repository';

export {
  UserRepository,
  GroupRepository,
  GroupMemberRepository,
  ExpenseRepository,
  SettlementRepository,
};

export interface Repositories {
  users: UserRepository;
  groups: GroupRepository;
  groupMembers: GroupMemberRepository;
  expenses: ExpenseRepository;
  settlements: SettlementRepository;
}

export function createRepositories(client: SupabaseClient<Database>): Repositories {
  return {
    users: new UserRepository(client),
    groups: new GroupRepository(client),
    groupMembers: new GroupMemberRepository(client),
    expenses: new ExpenseRepository(client),
    settlements: new SettlementRepository(client),
  };
}
