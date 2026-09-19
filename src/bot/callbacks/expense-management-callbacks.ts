import { Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { logger } from '../../shared/logger';
import { formatPaise } from '../../shared/currency';
import { escapeMarkdown } from '../../shared/markdown';
import { expenseEditStateManager } from '../../modules/expenses/expense-edit-state';
import { expenseStateManager } from '../../modules/expenses/expense-state';
import { validateDescription } from '../../modules/expenses/expense-validation';
import {
  formatExpenseHistoryMessage,
  formatExpenseDetailsMessage,
  formatDeleteConfirmationMessage,
  formatExpenseDeletedSuccessMessage,
} from '../messages/expense-management';
import {
  buildExpenseHistoryKeyboard,
  buildExpenseDetailsKeyboard,
  buildDeleteConfirmationKeyboard,
  buildEditMenuKeyboard,
  buildCancelEditDescriptionKeyboard,
  buildExpenseDeletedKeyboard,
} from '../keyboards/expense-management.keyboard';
import { buildCancelRow } from '../keyboards';

export async function handleExpenseManagementCallback(
  ctx: Context,
  data: string,
  services: BotServices
): Promise<boolean> {
  if (!ctx.chat || !ctx.from) return false;

  const chatId = ctx.chat.id;
  const userId = ctx.from.id;

  // 1. History trigger (/expenses command or 📋 Expenses button)
  if (data === 'action:expenses' || data === 'expm:list' || data === 'exp:history') {
    await ctx.answerCallbackQuery();
    try {
      const history = await services.expenseService.getExpenseHistoryForTelegram(chatId, userId, 1);
      const message = formatExpenseHistoryMessage(history, ctx.chat.title);
      const keyboard = buildExpenseHistoryKeyboard(history.expenses, history.page, history.totalPages);

      if (ctx.callbackQuery) {
        try {
          await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
        } catch {
          await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
        }
      } else {
        await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
      }
    } catch (err: any) {
      logger.error('Error fetching expense history:', err);
      await ctx.reply(`⚠️ ${err.message || 'Unable to retrieve expenses.'}`);
    }
    return true;
  }

  // Check prefix for management actions
  if (!data.startsWith('expm:')) {
    return false;
  }

  // 2. Pagination: expm:p:<page>
  if (data.startsWith('expm:p:')) {
    await ctx.answerCallbackQuery();
    const pageStr = data.replace('expm:p:', '');
    const page = Math.max(1, parseInt(pageStr, 10) || 1);

    try {
      const history = await services.expenseService.getExpenseHistoryForTelegram(chatId, userId, page);
      const message = formatExpenseHistoryMessage(history, ctx.chat.title);
      const keyboard = buildExpenseHistoryKeyboard(history.expenses, history.page, history.totalPages);

      try {
        await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
      } catch {
        await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
      }
    } catch (err: any) {
      logger.error('Error navigating expense pages:', err);
      await ctx.reply(`⚠️ ${err.message || 'Unable to retrieve expenses.'}`);
    }
    return true;
  }

  // 3. View expense details: expm:v:<expenseId>:<page>
  if (data.startsWith('expm:v:')) {
    const parts = data.replace('expm:v:', '').split(':');
    const expenseId = parts[0];
    const page = Math.max(1, parseInt(parts[1], 10) || 1);

    try {
      const details = await services.expenseService.getExpenseDetailsForTelegram(chatId, userId, expenseId);
      await ctx.answerCallbackQuery();
      const message = formatExpenseDetailsMessage(details);
      const keyboard = buildExpenseDetailsKeyboard(details.id, page, details.canManage);

      try {
        await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
      } catch {
        await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
      }
    } catch (err: any) {
      logger.error('Error viewing expense details:', err);
      await ctx.answerCallbackQuery({ text: `⚠️ ${err.message || 'Expense not found.'}`, show_alert: true });
    }
    return true;
  }

  // 4. Delete prompt / confirmation screen: expm:dp:<expenseId>:<page>
  if (data.startsWith('expm:dp:')) {
    const parts = data.replace('expm:dp:', '').split(':');
    const expenseId = parts[0];
    const page = Math.max(1, parseInt(parts[1], 10) || 1);

    try {
      const details = await services.expenseService.getExpenseDetailsForTelegram(chatId, userId, expenseId);

      if (!details.canManage) {
        await ctx.answerCallbackQuery({
          text: '⚠️ Only the creator or payer can delete this expense.',
          show_alert: true,
        });
        return true;
      }

      if (details.hasRepayments) {
        await ctx.answerCallbackQuery({
          text: '⚠️ This expense has repayment activity. It cannot be deleted because doing so would invalidate financial history.',
          show_alert: true,
        });
        return true;
      }

      await ctx.answerCallbackQuery();
      const message = formatDeleteConfirmationMessage(details);
      const keyboard = buildDeleteConfirmationKeyboard(details.id, page);

      try {
        await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
      } catch {
        await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
      }
    } catch (err: any) {
      logger.error('Error prompting expense delete:', err);
      await ctx.answerCallbackQuery({ text: `⚠️ ${err.message || 'Unable to delete expense.'}`, show_alert: true });
    }
    return true;
  }

  // 5. Confirm delete: expm:dc:<expenseId>:<page>
  if (data.startsWith('expm:dc:')) {
    const parts = data.replace('expm:dc:', '').split(':');
    const expenseId = parts[0];
    const page = Math.max(1, parseInt(parts[1], 10) || 1);

    try {
      const res = await services.expenseService.softDeleteExpenseForTelegram(chatId, userId, expenseId);

      if (res.alreadyDeleted) {
        await ctx.answerCallbackQuery({ text: 'This expense is already deleted.', show_alert: true });
        const history = await services.expenseService.getExpenseHistoryForTelegram(chatId, userId, page);
        const message = formatExpenseHistoryMessage(history, ctx.chat.title);
        const keyboard = buildExpenseHistoryKeyboard(history.expenses, history.page, history.totalPages);
        try {
          await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
        } catch {
          await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
        }
        return true;
      }

      await ctx.answerCallbackQuery({ text: 'Expense deleted.' });
      const successMessage = formatExpenseDeletedSuccessMessage(res.expense.description, res.expense.total_amount);
      const keyboard = buildExpenseDeletedKeyboard(page);

      try {
        await ctx.editMessageText(successMessage, { parse_mode: 'Markdown', reply_markup: keyboard });
      } catch {
        await ctx.reply(successMessage, { parse_mode: 'Markdown', reply_markup: keyboard });
      }
    } catch (err: any) {
      logger.error('Error confirming expense delete:', err);
      await ctx.answerCallbackQuery({ text: `⚠️ ${err.message || 'Failed to delete expense.'}`, show_alert: true });
    }
    return true;
  }

  // 6. Edit Menu: expm:em:<expenseId>:<page>
  if (data.startsWith('expm:em:')) {
    const parts = data.replace('expm:em:', '').split(':');
    const expenseId = parts[0];
    const page = Math.max(1, parseInt(parts[1], 10) || 1);

    try {
      const details = await services.expenseService.getExpenseDetailsForTelegram(chatId, userId, expenseId);

      if (!details.canManage) {
        await ctx.answerCallbackQuery({
          text: '⚠️ Only the creator or payer can edit this expense.',
          show_alert: true,
        });
        return true;
      }

      await ctx.answerCallbackQuery();

      let message = `✏️ *Edit Expense*\n\n*${escapeMarkdown(details.description)}* (${formatPaise(details.totalAmount)})\n\n`;
      if (details.hasRepayments) {
        message +=
          `⚠️ *This expense has related repayments.*\n` +
          `For financial safety, amount/payer/participants cannot be changed after repayment activity.\n\n` +
          `You may edit the description:`;
      } else {
        message += `Choose what you would like to edit:`;
      }

      const keyboard = buildEditMenuKeyboard(details.id, page, details.hasRepayments);
      try {
        await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
      } catch {
        await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
      }
    } catch (err: any) {
      logger.error('Error opening edit menu:', err);
      await ctx.answerCallbackQuery({ text: `⚠️ ${err.message || 'Unable to edit expense.'}`, show_alert: true });
    }
    return true;
  }

  // 7. Edit Description Prompt: expm:ed:<expenseId>:<page>
  if (data.startsWith('expm:ed:')) {
    const parts = data.replace('expm:ed:', '').split(':');
    const expenseId = parts[0];
    const page = Math.max(1, parseInt(parts[1], 10) || 1);

    try {
      const details = await services.expenseService.getExpenseDetailsForTelegram(chatId, userId, expenseId);

      if (!details.canManage) {
        await ctx.answerCallbackQuery({
          text: '⚠️ Only the creator or payer can edit this expense.',
          show_alert: true,
        });
        return true;
      }

      await ctx.answerCallbackQuery();

      expenseEditStateManager.setState({
        chatId,
        userId,
        expenseId: details.id,
        page,
        step: 'AWAITING_NEW_DESCRIPTION',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const message =
        `📝 *Edit Description*\n\n` +
        `Current description: *${escapeMarkdown(details.description)}*\n\n` +
        `Please send the new description for this expense:`;
      const keyboard = buildCancelEditDescriptionKeyboard(details.id, page);

      try {
        await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
      } catch {
        await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
      }
    } catch (err: any) {
      logger.error('Error starting description edit:', err);
      await ctx.answerCallbackQuery({ text: `⚠️ ${err.message || 'Unable to edit description.'}`, show_alert: true });
    }
    return true;
  }

  // 8. Full Edit (Amount & Splits): expm:ef:<expenseId>:<page>
  if (data.startsWith('expm:ef:')) {
    const parts = data.replace('expm:ef:', '').split(':');
    const expenseId = parts[0];
    const page = Math.max(1, parseInt(parts[1], 10) || 1);

    try {
      const details = await services.expenseService.getExpenseDetailsForTelegram(chatId, userId, expenseId);

      if (!details.canManage) {
        await ctx.answerCallbackQuery({
          text: '⚠️ Only the creator or payer can edit this expense.',
          show_alert: true,
        });
        return true;
      }

      if (details.hasRepayments) {
        await ctx.answerCallbackQuery({
          text: '⚠️ This expense has related repayments. For financial safety, amount/payer/participants cannot be changed after repayment activity.',
          show_alert: true,
        });
        return true;
      }

      await ctx.answerCallbackQuery();

      // Initialize full edit draft reusing creation flow state machine
      expenseStateManager.setState({
        chatId,
        userId,
        groupId: details.groupId,
        creatorUserId: details.createdByUserId,
        editingExpenseId: details.id,
        returnPage: page,
        description: details.description,
        step: 'AWAITING_AMOUNT',
        participantUserIds: details.splits.map((s) => s.userId),
        splits: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const prompt =
        `💰 *Edit Expense: Amount*\n\n` +
        `Editing *${escapeMarkdown(details.description)}*\n` +
        `Current total: ${formatPaise(details.totalAmount)}\n\n` +
        `Enter the new amount in ₹ (e.g. 2400 or 2400.50):`;

      await ctx.reply(prompt, {
        parse_mode: 'Markdown',
        reply_markup: buildCancelRow('exp:cancel'),
      });
    } catch (err: any) {
      logger.error('Error initiating full expense edit:', err);
      await ctx.answerCallbackQuery({ text: `⚠️ ${err.message || 'Unable to edit expense.'}`, show_alert: true });
    }
    return true;
  }

  // 9. No-op (e.g. page count indicator): expm:noop
  if (data === 'expm:noop') {
    await ctx.answerCallbackQuery();
    return true;
  }

  return false;
}

/**
 * Handles incoming text messages when a single-field description edit is active.
 */
export async function handleExpenseEditTextInput(
  ctx: Context,
  services: BotServices
): Promise<boolean> {
  if (!ctx.chat || !ctx.from || !ctx.message?.text) {
    return false;
  }

  const text = ctx.message.text.trim();

  // If user typed /cancel, clear edit state
  if (text.startsWith('/cancel')) {
    const editState = expenseEditStateManager.getState(ctx.chat.id, ctx.from.id);
    if (editState) {
      expenseEditStateManager.clearState(ctx.chat.id, ctx.from.id);
      await ctx.reply('❌ Expense editing cancelled.');
      return true;
    }
    return false;
  }

  const editState = expenseEditStateManager.getState(ctx.chat.id, ctx.from.id);
  if (!editState) {
    return false;
  }

  // Slash commands route elsewhere
  if (text.startsWith('/')) {
    return false;
  }

  try {
    const newDescription = validateDescription(text);
    await services.expenseService.updateExpenseDescriptionForTelegram(
      ctx.chat.id,
      ctx.from.id,
      editState.expenseId,
      newDescription
    );

    expenseEditStateManager.clearState(ctx.chat.id, ctx.from.id);

    const details = await services.expenseService.getExpenseDetailsForTelegram(
      ctx.chat.id,
      ctx.from.id,
      editState.expenseId
    );

    const message =
      `✅ Description updated to "*${escapeMarkdown(newDescription)}*"!\n\n` +
      formatExpenseDetailsMessage(details);
    const keyboard = buildExpenseDetailsKeyboard(details.id, editState.page, details.canManage);

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
    return true;
  } catch (err: any) {
    await ctx.reply(`❌ ${err.message || 'Invalid description. Please try again:'}`, {
      reply_markup: buildCancelEditDescriptionKeyboard(editState.expenseId, editState.page),
    });
    return true;
  }
}
