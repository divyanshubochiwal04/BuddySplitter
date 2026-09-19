import { Context, InlineKeyboard } from 'grammy';
import { BotServices } from '../../modules/services';
import { expenseStateManager } from '../../modules/expenses/expense-state';
import { calculateEqualSplit } from '../../modules/expenses/split/equal';
import { handleSharesCallback } from './shares-callbacks';
import {
  formatParticipantsPrompt,
  formatSplitTypePrompt,
  formatPayerPrompt,
  formatExpenseConfirmation,
  formatExpenseSuccess,
  CHANGE_MENU_PROMPT,
  NEW_DESCRIPTION_PROMPT,
  NEW_AMOUNT_PROMPT,
} from '../messages/expense';
import {
  buildParticipantsSelectionKeyboard,
  buildSplitTypeKeyboard,
  buildExpenseConfirmationKeyboard,
  buildChangeMenuKeyboard,
  buildPayerSelectionKeyboard,
  buildPayerListKeyboard,
  MemberOption,
} from '../keyboards';
import { logger } from '../../shared/logger';
import { escapeMarkdown } from '../../shared/markdown';

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
    if (
      data.startsWith('payer:') ||
      data.startsWith('part:') ||
      data.startsWith('split:') ||
      data.startsWith('exp:') ||
      data.startsWith('share:')
    ) {
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

  // 2. Shares Split Handling (delegated)
  if (data === 'split:shares' || data === 'exp:set_split:shares' || data.startsWith('share:')) {
    return handleSharesCallback(ctx, data, draft, services, getGroupMemberOptions);
  }

  // 3. Confirm & Save Expense
  if (data === 'exp:confirm' || data === 'exp:save') {
    if (draft.step === 'SAVING') {
      await ctx.answerCallbackQuery({ text: '⏳ Saving already in progress...', show_alert: false });
      return true;
    }

    expenseStateManager.updateState(chatId, userId, { step: 'SAVING' });
    await ctx.answerCallbackQuery({ text: 'Saving expense...' });

    try {
      if (draft.editingExpenseId) {
        await services.expenseService.updateExpenseFromDraft(draft);
      } else {
        await services.expenseService.createExpenseFromDraft(draft);
      }
      expenseStateManager.clearState(chatId, userId);

      const successText = draft.editingExpenseId
        ? `✅ Expense "*${escapeMarkdown(draft.description!)}*" updated successfully!\n\nGroup balances have been recalculated.`
        : formatExpenseSuccess(
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
      await ctx.reply('❌ Failed to save expense. Please try again.', {
        reply_markup: buildExpenseConfirmationKeyboard(),
      });
    }
    return true;
  }

  // 4. Change Menu Navigation
  if (data === 'exp:change') {
    expenseStateManager.updateState(chatId, userId, { step: 'CHANGE_MENU' });
    await ctx.answerCallbackQuery();
    try {
      await ctx.editMessageText(CHANGE_MENU_PROMPT, {
        parse_mode: 'Markdown',
        reply_markup: buildChangeMenuKeyboard(),
      });
    } catch {
      await ctx.reply(CHANGE_MENU_PROMPT, {
        parse_mode: 'Markdown',
        reply_markup: buildChangeMenuKeyboard(),
      });
    }
    return true;
  }

  // 5. Change Menu Options
  if (data === 'exp:ch_desc') {
    expenseStateManager.updateState(chatId, userId, { step: 'AWAITING_NEW_DESCRIPTION' });
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard()
      .text('⬅️ Back', 'exp:back_confirm')
      .text('❌ Cancel', 'exp:cancel');
    try {
      await ctx.editMessageText(NEW_DESCRIPTION_PROMPT, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch {
      await ctx.reply(NEW_DESCRIPTION_PROMPT, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    }
    return true;
  }

  if (data === 'exp:ch_amt') {
    expenseStateManager.updateState(chatId, userId, { step: 'AWAITING_NEW_AMOUNT' });
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard()
      .text('⬅️ Back', 'exp:back_confirm')
      .text('❌ Cancel', 'exp:cancel');
    try {
      await ctx.editMessageText(NEW_AMOUNT_PROMPT, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch {
      await ctx.reply(NEW_AMOUNT_PROMPT, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    }
    return true;
  }

  if (data === 'exp:ch_payer' || data === 'exp:change_payer') {
    expenseStateManager.updateState(chatId, userId, { step: 'AWAITING_PAYER' });
    const members = await getGroupMemberOptions();
    await ctx.answerCallbackQuery();
    const prompt = formatPayerPrompt(draft.totalAmount || 0);
    const keyboard = buildPayerSelectionKeyboard(members, draft.payerUserId);
    try {
      await ctx.editMessageText(prompt, { parse_mode: 'Markdown', reply_markup: keyboard });
    } catch {
      await ctx.reply(prompt, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
    return true;
  }

  if (data === 'exp:ch_part' || data === 'exp:change_participants') {
    expenseStateManager.updateState(chatId, userId, { step: 'AWAITING_PARTICIPANTS' });
    const members = await getGroupMemberOptions();
    await ctx.answerCallbackQuery();
    const prompt = formatParticipantsPrompt(draft.description || 'Expense', draft.totalAmount || 0);
    const keyboard = buildParticipantsSelectionKeyboard(members, new Set(draft.participantUserIds));
    try {
      await ctx.editMessageText(prompt, { parse_mode: 'Markdown', reply_markup: keyboard });
    } catch {
      await ctx.reply(prompt, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
    return true;
  }

  if (data === 'exp:ch_split' || data === 'exp:change_split') {
    expenseStateManager.updateState(chatId, userId, { step: 'AWAITING_SPLIT_TYPE' });
    await ctx.answerCallbackQuery();
    const prompt = formatSplitTypePrompt(draft.totalAmount || 0);
    const keyboard = buildSplitTypeKeyboard();
    try {
      await ctx.editMessageText(prompt, { parse_mode: 'Markdown', reply_markup: keyboard });
    } catch {
      await ctx.reply(prompt, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
    return true;
  }

  if (data === 'exp:back_confirm') {
    const updatedDraft = expenseStateManager.updateState(chatId, userId, {
      step: 'AWAITING_CONFIRMATION',
    });
    await ctx.answerCallbackQuery();
    if (updatedDraft) {
      const text = formatExpenseConfirmation(updatedDraft);
      const keyboard = buildExpenseConfirmationKeyboard();
      try {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
      } catch {
        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
      }
    }
    return true;
  }

  // 6. Payer Selection
  if (data.startsWith('exp:set_payer:') || data.startsWith('payer:select:')) {
    const selectedUserId = data.replace(/^(exp:set_payer:|payer:select:)/, '');
    const members = await getGroupMemberOptions();
    const payer = members.find((m) => m.userId === selectedUserId);

    if (!payer) {
      await ctx.answerCallbackQuery({ text: '⚠️ Member not found', show_alert: true });
      return true;
    }

    const updatedDraft = expenseStateManager.updateState(chatId, userId, {
      payerUserId: payer.userId,
      payerName: payer.name,
      step: 'AWAITING_CONFIRMATION',
    });

    await ctx.answerCallbackQuery();
    if (updatedDraft) {
      const text = formatExpenseConfirmation(updatedDraft);
      const keyboard = buildExpenseConfirmationKeyboard();
      try {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
      } catch {
        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
      }
    }
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
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({
      reply_markup: buildPayerSelectionKeyboard(members, draft.payerUserId),
    });
    return true;
  }

  // 7. Participants Selection
  if (data === 'exp:part_all' || data === 'part:everyone') {
    const members = await getGroupMemberOptions();
    const allUserIds = members.map((m) => m.userId);

    expenseStateManager.updateState(chatId, userId, {
      participantUserIds: allUserIds,
    });

    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({
      reply_markup: buildParticipantsSelectionKeyboard(members, new Set(allUserIds)),
    });
    return true;
  }

  if (data === 'exp:part_clear') {
    const members = await getGroupMemberOptions();
    expenseStateManager.updateState(chatId, userId, {
      participantUserIds: [],
    });

    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({
      reply_markup: buildParticipantsSelectionKeyboard(members, new Set()),
    });
    return true;
  }

  if (data.startsWith('exp:part_toggle:') || data.startsWith('part:toggle:')) {
    const toggleUserId = data.replace(/^(exp:part_toggle:|part:toggle:)/, '');
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

  if (data === 'exp:part_done' || data === 'part:continue') {
    if (draft.participantUserIds.length === 0) {
      await ctx.answerCallbackQuery({
        text: '⚠️ Please select at least one participant to split the expense.',
        show_alert: true,
      });
      return true;
    }

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
      splits: fullSplits,
      splitType: 'equal',
      step: 'AWAITING_CONFIRMATION',
    });

    await ctx.answerCallbackQuery();
    if (updatedDraft) {
      const text = formatExpenseConfirmation(updatedDraft);
      const keyboard = buildExpenseConfirmationKeyboard();
      try {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
      } catch {
        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
      }
    }
    return true;
  }

  // 8. Split Type Selection
  if (data === 'exp:set_split:equal' || data === 'split:equal') {
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
      sharesMap: undefined,
      step: 'AWAITING_CONFIRMATION',
    });

    await ctx.answerCallbackQuery();
    if (updatedDraft) {
      const text = formatExpenseConfirmation(updatedDraft);
      const keyboard = buildExpenseConfirmationKeyboard();
      try {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
      } catch {
        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
      }
    }
    return true;
  }

  if (data === 'exp:set_split:custom' || data === 'split:custom') {
    const members = await getGroupMemberOptions();
    const firstMember = members.find((m) => m.userId === draft.participantUserIds[0]);

    expenseStateManager.updateState(chatId, userId, {
      splitType: 'custom',
      splits: [],
      customSplitIndex: 0,
      sharesMap: undefined,
      step: 'AWAITING_CUSTOM_SPLIT',
    });

    await ctx.answerCallbackQuery();
    const prompt = `💰 Enter *${escapeMarkdown(firstMember?.name || 'First participant')}*'s share in ₹:`;
    const keyboard = new InlineKeyboard().text('❌ Cancel', 'exp:cancel');
    try {
      await ctx.editMessageText(prompt, { parse_mode: 'Markdown', reply_markup: keyboard });
    } catch {
      await ctx.reply(prompt, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
    return true;
  }

  if (data === 'exp:set_split:percentage' || data === 'split:percentage') {
    const members = await getGroupMemberOptions();
    const firstMember = members.find((m) => m.userId === draft.participantUserIds[0]);

    expenseStateManager.updateState(chatId, userId, {
      splitType: 'percentage',
      splits: [],
      customSplitIndex: 0,
      sharesMap: undefined,
      step: 'AWAITING_PERCENTAGE_SPLIT',
    });

    await ctx.answerCallbackQuery();
    const prompt = `📊 Enter *${escapeMarkdown(firstMember?.name || 'First participant')}*'s share percentage (0-100%):`;
    const keyboard = new InlineKeyboard().text('❌ Cancel', 'exp:cancel');
    try {
      await ctx.editMessageText(prompt, { parse_mode: 'Markdown', reply_markup: keyboard });
    } catch {
      await ctx.reply(prompt, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
    return true;
  }

  return false;
}
