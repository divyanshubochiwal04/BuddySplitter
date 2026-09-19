import { Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { expenseStateManager, ExpenseDraft } from '../../modules/expenses/expense-state';
import { calculateSharesSplit } from '../../modules/expenses/split/shares';
import {
  EXPENSE_SHARES_PROMPT,
  formatExpenseConfirmation,
} from '../messages/expense';
import {
  buildSharesKeyboard,
  buildExpenseConfirmationKeyboard,
  MemberOption,
} from '../keyboards';

export async function handleSharesCallback(
  ctx: Context,
  data: string,
  draft: ExpenseDraft,
  _services: BotServices,
  getGroupMemberOptions: () => Promise<MemberOption[]>
): Promise<boolean> {
  const chatId = draft.chatId;
  const userId = draft.userId;

  // 1. Initial selection of Shares split
  if (data === 'split:shares') {
    const members = await getGroupMemberOptions();
    const participantMembers = members.filter((m) =>
      draft.participantUserIds.includes(m.userId)
    );

    const initialSharesMap: Record<string, number> = {};
    for (const pId of draft.participantUserIds) {
      initialSharesMap[pId] = 1;
    }

    expenseStateManager.updateState(chatId, userId, {
      splitType: 'shares',
      sharesMap: initialSharesMap,
      splits: [],
      customSplitIndex: 0,
      step: 'AWAITING_SHARES_SPLIT',
    });

    await ctx.answerCallbackQuery();
    await ctx.reply(EXPENSE_SHARES_PROMPT, {
      parse_mode: 'Markdown',
      reply_markup: buildSharesKeyboard(participantMembers, initialSharesMap),
    });
    return true;
  }

  // 2. Non-interactive display buttons
  if (data === 'share:noop') {
    await ctx.answerCallbackQuery();
    return true;
  }

  // 3. Increment shares
  if (data.startsWith('share:inc:')) {
    const targetUserId = data.replace('share:inc:', '');
    const currentSharesMap = { ...(draft.sharesMap || {}) };
    const currentVal = currentSharesMap[targetUserId] ?? 1;

    if (currentVal >= 99) {
      await ctx.answerCallbackQuery({ text: '⚠️ Maximum 99 shares reached' });
      return true;
    }

    currentSharesMap[targetUserId] = currentVal + 1;
    expenseStateManager.updateState(chatId, userId, {
      sharesMap: currentSharesMap,
    });

    const members = await getGroupMemberOptions();
    const participantMembers = members.filter((m) =>
      draft.participantUserIds.includes(m.userId)
    );

    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({
      reply_markup: buildSharesKeyboard(participantMembers, currentSharesMap),
    });
    return true;
  }

  // 4. Decrement shares (bounded at minimum 1)
  if (data.startsWith('share:dec:')) {
    const targetUserId = data.replace('share:dec:', '');
    const currentSharesMap = { ...(draft.sharesMap || {}) };
    const currentVal = currentSharesMap[targetUserId] ?? 1;

    if (currentVal <= 1) {
      await ctx.answerCallbackQuery({
        text: '⚠️ Minimum share is 1',
        show_alert: false,
      });
      return true;
    }

    currentSharesMap[targetUserId] = currentVal - 1;
    expenseStateManager.updateState(chatId, userId, {
      sharesMap: currentSharesMap,
    });

    const members = await getGroupMemberOptions();
    const participantMembers = members.filter((m) =>
      draft.participantUserIds.includes(m.userId)
    );

    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({
      reply_markup: buildSharesKeyboard(participantMembers, currentSharesMap),
    });
    return true;
  }

  // 5. Continue to confirmation
  if (data === 'share:continue') {
    if (draft.participantUserIds.length === 0) {
      await ctx.answerCallbackQuery({
        text: '⚠️ At least one participant is required.',
        show_alert: true,
      });
      return true;
    }

    const currentSharesMap = draft.sharesMap || {};
    const shareInputs = draft.participantUserIds.map((uId) => ({
      userId: uId,
      shares: currentSharesMap[uId] ?? 1,
    }));

    try {
      const calculated = calculateSharesSplit(draft.totalAmount!, shareInputs);
      const members = await getGroupMemberOptions();

      const finalSplits = calculated.map((c) => {
        const member = members.find((m) => m.userId === c.userId);
        return {
          userId: c.userId,
          name: member?.name || 'Member',
          amount: c.amount,
          shares: c.shares,
        };
      });

      const updatedDraft = expenseStateManager.updateState(chatId, userId, {
        splits: finalSplits,
        step: 'AWAITING_CONFIRMATION',
      });

      await ctx.answerCallbackQuery();
      if (updatedDraft) {
        await ctx.reply(formatExpenseConfirmation(updatedDraft), {
          parse_mode: 'Markdown',
          reply_markup: buildExpenseConfirmationKeyboard(),
        });
      }
    } catch (err: any) {
      await ctx.answerCallbackQuery({
        text: `❌ ${err.message || 'Failed to calculate shares split'}`,
        show_alert: true,
      });
    }
    return true;
  }

  return false;
}
