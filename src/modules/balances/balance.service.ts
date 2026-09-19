import { ExpenseRepository } from '../../db/repositories/expenses.repository';
import { GroupRepository } from '../../db/repositories/groups.repository';
import { GroupMemberRepository } from '../../db/repositories/group-members.repository';
import { UserRepository } from '../../db/repositories/users.repository';
import { SettlementRepository } from '../../db/repositories/settlements.repository';
import { ValidationError, NotFoundError } from '../../shared/errors';
import { calculateGroupBalances, MemberIdentity } from './balance.calculator';
import { reconcileBalances } from './balance.reconciliation';
import {
  GroupBalanceSummary,
  UserPersonalBalance,
  ReconciledGroupBalanceSummary,
  ReconciledUserPersonalBalance,
} from './balance.types';

export class BalanceService {
  constructor(
    private readonly expenseRepo: ExpenseRepository,
    private readonly groupRepo: GroupRepository,
    private readonly groupMemberRepo: GroupMemberRepository,
    private readonly userRepo: UserRepository,
    private readonly settlementRepo?: SettlementRepository
  ) {}

  /**
   * Calculates the full balance summary for a group by database group ID.
   */
  async getGroupBalanceSummary(groupId: string): Promise<GroupBalanceSummary> {
    const group = await this.groupRepo.findById(groupId);
    if (!group) {
      throw new NotFoundError(`Group with ID ${groupId} not found`);
    }

    // 1. Fetch active group members
    const activeMembers = await this.groupMemberRepo.findActiveMembersByGroupId(groupId);

    // 2. Resolve display names for members
    const memberIdentities: MemberIdentity[] = await Promise.all(
      activeMembers.map(async (m) => {
        if (m.display_name && m.display_name.trim() !== '') {
          return { userId: m.user_id, displayName: m.display_name };
        }
        const user = await this.userRepo.findById(m.user_id);
        const name = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : 'Member';
        return { userId: m.user_id, displayName: name || 'Member' };
      })
    );

    // 3. Fetch active expenses and their splits in batch (no N+1)
    const expensesWithSplits =
      await this.expenseRepo.findActiveExpensesWithSplitsByGroupId(groupId);

    // 4. Calculate pure balances with invariant checks
    return calculateGroupBalances(groupId, memberIdentities, expensesWithSplits);
  }

  /**
   * Calculates personal balance for a specific user in a group by database IDs.
   */
  async getUserBalanceInGroup(groupId: string, userId: string): Promise<UserPersonalBalance> {
    const summary = await this.getGroupBalanceSummary(groupId);
    const memberBalance = summary.allBalances.find((b) => b.userId === userId);

    if (memberBalance) {
      return {
        userId: memberBalance.userId,
        displayName: memberBalance.displayName,
        paidAmount: memberBalance.paidAmount,
        owedAmount: memberBalance.owedAmount,
        netBalance: memberBalance.netBalance,
        category: memberBalance.category,
      };
    }

    // If user is a member with 0 activity
    const user = await this.userRepo.findById(userId);
    const displayName = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : 'You';

    return {
      userId,
      displayName: displayName || 'You',
      paidAmount: 0,
      owedAmount: 0,
      netBalance: 0,
      category: 'settled',
    };
  }

  /**
   * Helper for Telegram command and callback handlers.
   * Validates group registration, user registration, and active membership before calculating.
   */
  async getGroupSummaryForTelegram(
    telegramChatId: number,
    telegramUserId: number
  ): Promise<GroupBalanceSummary> {
    const group = await this.groupRepo.findByTelegramChatId(telegramChatId);
    if (!group) {
      throw new NotFoundError('Group is not registered. Please run /start inside the group.');
    }

    const user = await this.userRepo.findByTelegramId(telegramUserId);
    if (!user) {
      throw new NotFoundError('User profile not found. Please interact with the bot first.');
    }

    const membership = await this.groupMemberRepo.findByGroupAndUser(group.id, user.id);
    if (!membership || !membership.is_active) {
      throw new ValidationError('You must be an active member of this group to view balances.');
    }

    return this.getGroupBalanceSummary(group.id);
  }

  /**
   * Helper for Telegram personal balance check.
   * Validates group registration, user registration, and active membership before calculating.
   */
  async getUserBalanceForTelegram(
    telegramChatId: number,
    telegramUserId: number
  ): Promise<UserPersonalBalance> {
    const group = await this.groupRepo.findByTelegramChatId(telegramChatId);
    if (!group) {
      throw new NotFoundError('Group is not registered. Please run /start inside the group.');
    }

    const user = await this.userRepo.findByTelegramId(telegramUserId);
    if (!user) {
      throw new NotFoundError('User profile not found. Please interact with the bot first.');
    }

    const membership = await this.groupMemberRepo.findByGroupAndUser(group.id, user.id);
    if (!membership || !membership.is_active) {
      throw new ValidationError('You must be an active member of this group to view balances.');
    }

    return this.getUserBalanceInGroup(group.id, user.id);
  }

  /**
   * Calculates the reconciled balance summary for a group, accounting for all paid repayments.
   */
  async getReconciledGroupBalanceSummary(groupId: string): Promise<ReconciledGroupBalanceSummary> {
    const rawSummary = await this.getGroupBalanceSummary(groupId);
    const paidSettlements = this.settlementRepo
      ? await this.settlementRepo.findPaidByGroupId(groupId)
      : [];
    return reconcileBalances(rawSummary, paidSettlements);
  }

  /**
   * Calculates reconciled personal balance for a specific user in a group by database IDs.
   */
  async getReconciledUserBalanceInGroup(
    groupId: string,
    userId: string
  ): Promise<ReconciledUserPersonalBalance> {
    const summary = await this.getReconciledGroupBalanceSummary(groupId);
    const member = summary.allBalances.find((b) => b.userId === userId);

    if (member) {
      return {
        userId: member.userId,
        displayName: member.displayName,
        paidAmount: member.paidAmount,
        owedAmount: member.owedAmount,
        rawBalance: member.rawBalance,
        paymentsMade: member.paymentsMade,
        paymentsReceived: member.paymentsReceived,
        outstandingNet: member.outstandingNet,
        category: member.category,
      };
    }

    const user = await this.userRepo.findById(userId);
    const displayName = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : 'You';

    return {
      userId,
      displayName: displayName || 'You',
      paidAmount: 0,
      owedAmount: 0,
      rawBalance: 0,
      paymentsMade: 0,
      paymentsReceived: 0,
      outstandingNet: 0,
      category: 'settled',
    };
  }

  /**
   * Helper for Telegram command /summary to get reconciled group summary.
   */
  async getReconciledGroupSummaryForTelegram(
    telegramChatId: number,
    telegramUserId: number
  ): Promise<ReconciledGroupBalanceSummary> {
    const group = await this.groupRepo.findByTelegramChatId(telegramChatId);
    if (!group) {
      throw new NotFoundError('Group is not registered. Please run /start inside the group.');
    }

    const user = await this.userRepo.findByTelegramId(telegramUserId);
    if (!user) {
      throw new NotFoundError('User profile not found. Please interact with the bot first.');
    }

    const membership = await this.groupMemberRepo.findByGroupAndUser(group.id, user.id);
    if (!membership || !membership.is_active) {
      throw new ValidationError('You must be an active member of this group to view balances.');
    }

    return this.getReconciledGroupBalanceSummary(group.id);
  }

  /**
   * Helper for Telegram command /balance to get reconciled personal balance.
   */
  async getReconciledUserBalanceForTelegram(
    telegramChatId: number,
    telegramUserId: number
  ): Promise<ReconciledUserPersonalBalance> {
    const group = await this.groupRepo.findByTelegramChatId(telegramChatId);
    if (!group) {
      throw new NotFoundError('Group is not registered. Please run /start inside the group.');
    }

    const user = await this.userRepo.findByTelegramId(telegramUserId);
    if (!user) {
      throw new NotFoundError('User profile not found. Please interact with the bot first.');
    }

    const membership = await this.groupMemberRepo.findByGroupAndUser(group.id, user.id);
    if (!membership || !membership.is_active) {
      throw new ValidationError('You must be an active member of this group to view balances.');
    }

    return this.getReconciledUserBalanceInGroup(group.id, user.id);
  }
}
