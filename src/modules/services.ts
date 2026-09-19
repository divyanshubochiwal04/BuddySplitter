import { Repositories } from '../db/repositories';
import { UserService } from './users/user.service';
import { GroupService } from './groups/group.service';
import { ExpenseService } from './expenses/expense.service';
import { BalanceService } from './balances/balance.service';
import { SettlementService } from './settlements/settlement.service';

export interface BotServices {
  userService: UserService;
  groupService: GroupService;
  expenseService: ExpenseService;
  balanceService: BalanceService;
  settlementService: SettlementService;
}

export function createServices(repositories: Repositories): BotServices {
  const balanceService = new BalanceService(
    repositories.expenses,
    repositories.groups,
    repositories.groupMembers,
    repositories.users,
    repositories.settlements
  );

  return {
    userService: new UserService(repositories.users),
    groupService: new GroupService(repositories.groups, repositories.groupMembers),
    expenseService: new ExpenseService(
      repositories.expenses,
      repositories.groupMembers,
      repositories.settlements,
      repositories.users,
      repositories.groups
    ),
    balanceService,
    settlementService: new SettlementService(
      balanceService,
      repositories.settlements,
      repositories.groups,
      repositories.groupMembers,
      repositories.users
    ),
  };
}
