import { Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { expenseStateManager } from '../../modules/expenses/expense-state';
import { calculateEqualSplit } from '../../modules/expenses/split/equal';
import {
  formatParticipantsPrompt,
  formatSplitTypePrompt,
  formatExpenseConfirmation,
  formatExpenseSuccess,
  EXPENSE_DESCRIPTION_PROMPT,
} from '../messages/expense';
import {
  buildParticipantsSelectionKeyboard,
  buildSplitTypeKeyboard,
  buildExpenseConfirmationKeyboard,
  buildPayerSelectionKeyboard,
  buildPayerListKeyboard,
  buildCancelRow,
  MemberOption,
} from '../keyboards';
import { logger } from '../../shared/logger';

export async function handleExpenseCallback(
  ctx: Context,
  data: string,
  services: BotServices
): Promise<boolean> {
  if (!ctx.chat || !ctx.from) return false;

  const chatId = ctx.chat.id;
  const userId = ctx.from.id;

  // 1. Cancel action
  if (data === 'exp:cancel' || data === 'action:cancel') {
    expenseStateManager.clearState(chatId, userId);
    await ctx.answerCallbackQuery({ text: 'Expense creation cancelled.' });
    try {
      await ctx.editMessageText('❌ Expense creation cancelled.');
    } catch {
      await ctx.reply('❌ Expense creation cancelled.');
    }
    return true;
  }

  const draft = expenseStateManager.getState(chatId, userId);
  if (!draft) {
    if (data.startsWith('payer:') || data.startsWith('part:') || data.startsWith('split:') || data.startsWith('exp:')) {
      await ctx.answerCallbackQuery({
        text: '⚠️ This expense session has expired. Type /add to start a new expense.',
        show_alert: true,
      });
      return true;
    }
    return false;
  }

  // Helper to fetch active members for this group
  const getGroupMemberOptions = async (): Promise<MemberOption[]> => {
    const members = await services.groupService.getActiveMembers(draft.groupId);
    return Promise.all(
      members.map(async (m) => {
        const u = await services.userService.getUserById(m.userId);
        return {
          userId: m.userId,
          name: m.displayName || u?.firstName || 'Member',
        };
      })
    );
  };

  // 2. Payer Selection
  if (data.startsWith('payer:select:')) {
    const selectedUserId = data.replace('payer:select:', '');
    const members = await getGroupMemberOptions();
    const payer = members.find((m) => m.userId === selectedUserId);

    if (!payer) {
      await ctx.answerCallbackQuery({ text: '⚠️ Member not found', show_alert: true });
      return true;
    }

    const allMemberIds = members.map((m) => m.userId);
    expenseStateManager.updateState(chatId, userId, {
      payerUserId: payer.userId,
      payerName: payer.name,
      participantUserIds: allMemberIds, // Default to everyone selected
      step: 'AWAITING_PARTICIPANTS',
    });

    await ctx.answerCallbackQuery();
    await ctx.reply(formatParticipantsPrompt(draft.description!, draft.totalAmount!), {
      parse_mode: 'Markdown',
      reply_markup: buildParticipantsSelectionKeyboard(members, new Set(allMemberIds)),
    });
    return true;
  }

  if (data === 'payer:list') {
    const members = await getGroupMemberOptions();
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({
      reply_markup: buildPayerListKeyboard(members),
    });
    return true;
  }

  if (data === 'payer:back') {
    const members = await getGroupMemberOptions();
    const creator = members.find((m) => m.userId === draft.creatorUserId) || {
      userId: draft.creatorUserId,
      name: ctx.from.first_name,
    };
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({
      reply_markup: buildPayerSelectionKeyboard(creator, members),
    });
    return true;
  }

  // 3. Participants Selection
  if (data === 'part:everyone') {
    const members = await getGroupMemberOptions();
    const allUserIds = members.map((m) => m.userId);

    expenseStateManager.updateState(chatId, userId, {
      participantUserIds: allUserIds,
      step: 'AWAITING_SPLIT_TYPE',
    });

    await ctx.answerCallbackQuery();
    await ctx.reply(formatSplitTypePrompt(draft.totalAmount!), {
      parse_mode: 'Markdown',
      reply_markup: buildSplitTypeKeyboard(),
    });
    return true;
  }

  if (data.startsWith('part:toggle:')) {
    const toggleUserId = data.replace('part:toggle:', '');
    const currentSet = new Set(draft.participantUserIds);

    if (currentSet.has(toggleUserId)) {
      currentSet.delete(toggleUserId);
    } else {
      currentSet.add(toggleUserId);
    }

    const updatedIds = Array.from(currentSet);
    expenseStateManager.updateState(chatId, userId, {
      participantUserIds: updatedIds,
    });

    const members = await getGroupMemberOptions();
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({
      reply_markup: buildParticipantsSelectionKeyboard(members, currentSet),
    });
    return true;
  }

  if (data === 'part:continue') {
    if (draft.participantUserIds.length === 0) {
      await ctx.answerCallbackQuery({
        text: '⚠️ Please select at least one participant to split the expense.',
        show_alert: true,
      });
      return true;
    }

    expenseStateManager.updateState(chatId, userId, {
      step: 'AWAITING_SPLIT_TYPE',
    });

    await ctx.answerCallbackQuery();
    await ctx.reply(formatSplitTypePrompt(draft.totalAmount!), {
      parse_mode: 'Markdown',
      reply_markup: buildSplitTypeKeyboard(),
    });
    return true;
  }

  // 4. Split Type
  if (data === 'split:equal') {
    const members = await getGroupMemberOptions();
    const splitsCalculated = calculateEqualSplit(draft.totalAmount!, draft.participantUserIds);

    const fullSplits = splitsCalculated.map((s) => {
      const member = members.find((m) => m.userId === s.userId);
      return {
        userId: s.userId,
        name: member?.name || 'Member',
        amount: s.amount,
      };
    });

    const updatedDraft = expenseStateManager.updateState(chatId, userId, {
      splitType: 'equal',
      splits: fullSplits,
      step: 'AWAITING_CONFIRMATION',
    });

    await ctx.answerCallbackQuery();
    if (updatedDraft) {
      await ctx.reply(formatExpenseConfirmation(updatedDraft), {
        parse_mode: 'Markdown',
        reply_markup: buildExpenseConfirmationKeyboard(),
      });
    }
    return true;
  }

  if (data === 'split:custom') {
    const members = await getGroupMemberOptions();
    const firstMember = members.find((m) => m.userId === draft.participantUserIds[0]);

    expenseStateManager.updateState(chatId, userId, {
      splitType: 'custom',
      splits: [],
      customSplitIndex: 0,
      step: 'AWAITING_CUSTOM_SPLIT',
    });

    await ctx.answerCallbackQuery();
    await ctx.reply(
      `💰 Enter *${firstMember?.name || 'First participant'}*'s share in ₹:`,
      {
        parse_mode: 'Markdown',
        reply_markup: buildCancelRow('exp:cancel'),
      }
    );
    return true;
  }

  if (data === 'split:percentage') {
    const members = await getGroupMemberOptions();
    const firstMember = members.find((m) => m.userId === draft.participantUserIds[0]);

    expenseStateManager.updateState(chatId, userId, {
      splitType: 'percentage',
      splits: [],
      customSplitIndex: 0,
      step: 'AWAITING_PERCENTAGE_SPLIT',
    });

    await ctx.answerCallbackQuery();
    await ctx.reply(
      `📊 Enter *${firstMember?.name || 'First participant'}*'s share percentage (0-100%):`,
      {
        parse_mode: 'Markdown',
        reply_markup: buildCancelRow('exp:cancel'),
      }
    );
    return true;
  }

  // 5. Confirmation
  if (data === 'exp:confirm') {
    // Idempotency: prevent double submissions
    if (draft.step === 'SAVING') {
      await ctx.answerCallbackQuery({ text: '⏳ Saving already in progress...', show_alert: false });
      return true;
    }

    expenseStateManager.updateState(chatId, userId, { step: 'SAVING' });
    await ctx.answerCallbackQuery({ text: 'Saving expense...' });

    try {
      await services.expenseService.createExpenseFromDraft(draft);
      expenseStateManager.clearState(chatId, userId);

      const successText = formatExpenseSuccess(
        draft.description!,
        draft.totalAmount!,
        draft.payerName || 'Payer'
      );

      try {
        await ctx.editMessageText(successText, { parse_mode: 'Markdown' });
      } catch {
        await ctx.reply(successText, { parse_mode: 'Markdown' });
      }
    } catch (error: any) {
      logger.error('Failed to create expense from draft:', error);
      expenseStateManager.updateState(chatId, userId, { step: 'AWAITING_CONFIRMATION' });
      await ctx.reply(`❌ Failed to save expense: ${error.message || 'Please try again.'}`, {
        reply_markup: buildExpenseConfirmationKeyboard(),
      });
    }
    return true;
  }

  if (data === 'exp:edit') {
    expenseStateManager.updateState(chatId, userId, {
      step: 'AWAITING_DESCRIPTION',
      splits: [],
      customSplitIndex: 0,
    });
    await ctx.answerCallbackQuery({ text: 'Editing expense...' });
    await ctx.reply(EXPENSE_DESCRIPTION_PROMPT, {
      parse_mode: 'Markdown',
      reply_markup: buildCancelRow('exp:cancel'),
    });
    return true;
  }

  return false;
}
