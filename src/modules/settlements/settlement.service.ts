import { BalanceService } from '../balances/balance.service';
import {
  calculateSettlements,
  calculateUserSettlementSummary,
} from './settlement.calculator';
import { GroupSettlementPlan, UserSettlementSummary } from './settlement.types';

export class SettlementService {
  constructor(private readonly balanceService: BalanceService) {}

  /**
   * Computes the recommended group settlement plan for a given database group ID.
   * Delegates balance aggregation to Phase 6 BalanceService (no duplicate DB queries).
   */
  async getGroupSettlementPlan(groupId: string): Promise<GroupSettlementPlan> {
    const balanceSummary = await this.balanceService.getGroupBalanceSummary(groupId);
    return calculateSettlements(groupId, balanceSummary.allBalances);
  }

  /**
   * Computes the personal settlement summary for a specific user in a group by database IDs.
   */
  async getUserSettlementSummary(groupId: string, userId: string): Promise<UserSettlementSummary> {
    const balanceSummary = await this.balanceService.getGroupBalanceSummary(groupId);
    const plan = calculateSettlements(groupId, balanceSummary.allBalances);
    const member = balanceSummary.allBalances.find((b) => b.userId === userId);
    const displayName = member?.displayName || 'You';

    return calculateUserSettlementSummary(userId, displayName, plan);
  }

  /**
   * Computes the group settlement plan for a Telegram context.
   * Validates group registration, user registration, and active group membership.
   */
  async getGroupSettlementPlanForTelegram(
    telegramChatId: number,
    telegramUserId: number
  ): Promise<GroupSettlementPlan> {
    const balanceSummary = await this.balanceService.getGroupSummaryForTelegram(
      telegramChatId,
      telegramUserId
    );
    return calculateSettlements(balanceSummary.groupId, balanceSummary.allBalances);
  }

  /**
   * Computes both the personal settlement summary and the group plan for a Telegram context.
   * Validates group registration, user registration, and active group membership.
   */
  async getUserSettlementSummaryForTelegram(
    telegramChatId: number,
    telegramUserId: number
  ): Promise<{ userSummary: UserSettlementSummary; groupPlan: GroupSettlementPlan }> {
    const balanceSummary = await this.balanceService.getGroupSummaryForTelegram(
      telegramChatId,
      telegramUserId
    );
    const userBalance = await this.balanceService.getUserBalanceForTelegram(
      telegramChatId,
      telegramUserId
    );

    const groupPlan = calculateSettlements(balanceSummary.groupId, balanceSummary.allBalances);
    const userSummary = calculateUserSettlementSummary(
      userBalance.userId,
      userBalance.displayName,
      groupPlan
    );

    return { userSummary, groupPlan };
  }
}
