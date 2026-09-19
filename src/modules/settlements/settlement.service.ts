import { BalanceService } from '../balances/balance.service';
import { reconciledToMemberBalances } from '../balances/balance.reconciliation';
import { MemberBalance } from '../balances/balance.types';
import {
  calculateSettlements,
  calculateUserSettlementSummary,
} from './settlement.calculator';
import {
  GroupSettlementPlan,
  PaymentHistoryItem,
  RecordPaymentParams,
  UserSettlementSummary,
} from './settlement.types';
import { SettlementRepository } from '../../db/repositories/settlements.repository';
import { GroupRepository } from '../../db/repositories/groups.repository';
import { GroupMemberRepository } from '../../db/repositories/group-members.repository';
import { UserRepository } from '../../db/repositories/users.repository';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { SettlementRow } from '../../db/types';

export class SettlementService {
  constructor(
    private readonly balanceService: BalanceService,
    private readonly settlementRepo?: SettlementRepository,
    private readonly groupRepo?: GroupRepository,
    private readonly groupMemberRepo?: GroupMemberRepository,
    private readonly userRepo?: UserRepository
  ) {}

  private async getActiveBalancesForGroup(
    groupId: string
  ): Promise<{ groupId: string; balances: MemberBalance[] }> {
    if (typeof this.balanceService.getReconciledGroupBalanceSummary === 'function') {
      const summary = await this.balanceService.getReconciledGroupBalanceSummary(groupId);
      if (summary) {
        return { groupId: summary.groupId, balances: reconciledToMemberBalances(summary) };
      }
    }
    const raw = await this.balanceService.getGroupBalanceSummary(groupId);
    return { groupId: raw.groupId, balances: raw.allBalances };
  }

  private async getActiveBalancesForTelegram(
    telegramChatId: number,
    telegramUserId: number
  ): Promise<{ groupId: string; balances: MemberBalance[] }> {
    if (typeof this.balanceService.getReconciledGroupSummaryForTelegram === 'function') {
      const summary = await this.balanceService.getReconciledGroupSummaryForTelegram(
        telegramChatId,
        telegramUserId
      );
      if (summary) {
        return { groupId: summary.groupId, balances: reconciledToMemberBalances(summary) };
      }
    }
    const raw = await this.balanceService.getGroupSummaryForTelegram(
      telegramChatId,
      telegramUserId
    );
    return { groupId: raw.groupId, balances: raw.allBalances };
  }

  /**
   * Computes the recommended group settlement plan for a given database group ID.
   * Delegates balance aggregation to BalanceService and accounts for recorded repayments.
   */
  async getGroupSettlementPlan(groupId: string): Promise<GroupSettlementPlan> {
    const { balances } = await this.getActiveBalancesForGroup(groupId);
    return calculateSettlements(groupId, balances);
  }

  /**
   * Computes the personal settlement summary for a specific user in a group by database IDs.
   */
  async getUserSettlementSummary(groupId: string, userId: string): Promise<UserSettlementSummary> {
    const { balances } = await this.getActiveBalancesForGroup(groupId);
    const plan = calculateSettlements(groupId, balances);
    const member = balances.find((b) => b.userId === userId);
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
    const { groupId, balances } = await this.getActiveBalancesForTelegram(
      telegramChatId,
      telegramUserId
    );
    return calculateSettlements(groupId, balances);
  }

  /**
   * Computes both the personal settlement summary and the group plan for a Telegram context.
   * Validates group registration, user registration, and active group membership.
   */
  async getUserSettlementSummaryForTelegram(
    telegramChatId: number,
    telegramUserId: number
  ): Promise<{ userSummary: UserSettlementSummary; groupPlan: GroupSettlementPlan }> {
    const { groupId, balances } = await this.getActiveBalancesForTelegram(
      telegramChatId,
      telegramUserId
    );
    const userBalance = await this.balanceService.getUserBalanceForTelegram(
      telegramChatId,
      telegramUserId
    );

    const groupPlan = calculateSettlements(groupId, balances);
    const userSummary = calculateUserSettlementSummary(
      userBalance.userId,
      userBalance.displayName,
      groupPlan
    );

    return { userSummary, groupPlan };
  }

  /**
   * Records a confirmed repayment in the database.
   * Validates that the payment does not exceed current outstanding debt to that recipient.
   */
  async recordPayment(params: RecordPaymentParams): Promise<SettlementRow> {
    if (!this.settlementRepo) {
      throw new Error('SettlementRepository is not configured.');
    }

    if (params.fromUserId === params.toUserId) {
      throw new ValidationError('from_user_id cannot be the same as to_user_id');
    }

    if (!Number.isInteger(params.amount) || params.amount <= 0) {
      throw new ValidationError('Settlement amount must be a positive integer in minor units');
    }

    // Determine current outstanding settlement plan
    const plan = await this.getGroupSettlementPlan(params.groupId);
    const debtTx = plan.transactions.find(
      (tx) => tx.fromUserId === params.fromUserId && tx.toUserId === params.toUserId
    );

    if (!debtTx || params.amount > debtTx.amount) {
      throw new ValidationError('❌ Payment exceeds the current amount owed.');
    }

    return this.settlementRepo.create({
      group_id: params.groupId,
      from_user_id: params.fromUserId,
      to_user_id: params.toUserId,
      amount: params.amount,
      currency: params.currency || 'INR',
      status: 'paid',
      created_by: params.createdBy,
      settled_at: new Date().toISOString(),
    });
  }

  /**
   * Records a confirmed repayment in a Telegram context.
   * Validates group, payer, recipient, and active memberships.
   */
  async recordPaymentForTelegram(params: {
    telegramChatId: number;
    telegramUserId: number;
    toUserId: string;
    amount: number;
  }): Promise<{ settlement: SettlementRow; fromDisplayName: string; toDisplayName: string }> {
    if (!this.groupRepo || !this.userRepo || !this.groupMemberRepo) {
      throw new Error('Repositories are not configured.');
    }

    const group = await this.groupRepo.findByTelegramChatId(params.telegramChatId);
    if (!group) {
      throw new NotFoundError('Group is not registered. Please run /start inside the group.');
    }

    const payer = await this.userRepo.findByTelegramId(params.telegramUserId);
    if (!payer) {
      throw new NotFoundError('User profile not found. Please interact with the bot first.');
    }

    const payerMember = await this.groupMemberRepo.findByGroupAndUser(group.id, payer.id);
    if (!payerMember || !payerMember.is_active) {
      throw new ValidationError('You must be an active member of this group to record payments.');
    }

    if (payer.id === params.toUserId) {
      throw new ValidationError('You cannot make a repayment to yourself.');
    }

    const recipientMember = await this.groupMemberRepo.findByGroupAndUser(group.id, params.toUserId);
    if (!recipientMember || !recipientMember.is_active) {
      throw new ValidationError('Recipient must be an active member of this group.');
    }

    const fromDisplayName =
      payerMember.display_name ||
      [payer.first_name, payer.last_name].filter(Boolean).join(' ') ||
      'You';

    let toDisplayName = recipientMember.display_name;
    if (!toDisplayName) {
      const recipientUser = await this.userRepo.findById(params.toUserId);
      toDisplayName = recipientUser
        ? [recipientUser.first_name, recipientUser.last_name].filter(Boolean).join(' ')
        : 'Recipient';
    }

    const settlement = await this.recordPayment({
      groupId: group.id,
      fromUserId: payer.id,
      toUserId: params.toUserId,
      amount: params.amount,
      createdBy: payer.id,
      currency: 'INR',
    });

    return {
      settlement,
      fromDisplayName,
      toDisplayName: toDisplayName || 'Recipient',
    };
  }

  /**
   * Retrieves recent payment history for a Telegram group.
   */
  async getRecentPaymentsForTelegram(
    telegramChatId: number,
    telegramUserId: number,
    limit = 10
  ): Promise<{ payments: PaymentHistoryItem[]; groupTitle: string }> {
    if (!this.groupRepo || !this.userRepo || !this.groupMemberRepo || !this.settlementRepo) {
      throw new Error('Repositories are not configured.');
    }

    const group = await this.groupRepo.findByTelegramChatId(telegramChatId);
    if (!group) {
      throw new NotFoundError('Group is not registered. Please run /start inside the group.');
    }

    const user = await this.userRepo.findByTelegramId(telegramUserId);
    if (!user) {
      throw new NotFoundError('User profile not found. Please interact with the bot first.');
    }

    const member = await this.groupMemberRepo.findByGroupAndUser(group.id, user.id);
    if (!member || !member.is_active) {
      throw new ValidationError('You must be an active member of this group to view payments.');
    }

    const rows = await this.settlementRepo.findRecentPaidByGroupId(group.id, limit);

    const payments: PaymentHistoryItem[] = await Promise.all(
      rows.map(async (row) => {
        const fromMember = await this.groupMemberRepo!.findByGroupAndUser(group.id, row.from_user_id);
        const toMember = await this.groupMemberRepo!.findByGroupAndUser(group.id, row.to_user_id);

        let fromName = fromMember?.display_name;
        if (!fromName) {
          const u = await this.userRepo!.findById(row.from_user_id);
          fromName = u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : 'Member';
        }

        let toName = toMember?.display_name;
        if (!toName) {
          const u = await this.userRepo!.findById(row.to_user_id);
          toName = u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : 'Member';
        }

        return {
          id: row.id,
          fromUserId: row.from_user_id,
          fromDisplayName: fromName || 'Member',
          toUserId: row.to_user_id,
          toDisplayName: toName || 'Member',
          amount: row.amount,
          currency: row.currency,
          settledAt: row.settled_at || row.created_at,
          createdAt: row.created_at,
        };
      })
    );

    return {
      payments,
      groupTitle: group.title || 'Group',
    };
  }
}
