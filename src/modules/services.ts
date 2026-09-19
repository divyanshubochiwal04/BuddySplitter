import { Repositories } from '../db/repositories';
import { UserService } from './users/user.service';
import { GroupService } from './groups/group.service';
import { ExpenseService } from './expenses/expense.service';
import { BalanceService } from './balances/balance.service';

export interface BotServices {
  userService: UserService;
  groupService: GroupService;
  expenseService: ExpenseService;
  balanceService: BalanceService;
}

export function createServices(repositories: Repositories): BotServices {
  return {
    userService: new UserService(repositories.users),
    groupService: new GroupService(repositories.groups, repositories.groupMembers),
    expenseService: new ExpenseService(repositories.expenses, repositories.groupMembers),
    balanceService: new BalanceService(
      repositories.expenses,
      repositories.groups,
      repositories.groupMembers,
      repositories.users
    ),
  };
}
