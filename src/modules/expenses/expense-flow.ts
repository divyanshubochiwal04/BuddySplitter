import { Context } from 'grammy';
import { BotServices } from '../services';
import { expenseStateManager, ExpenseDraft, ExpenseFlowStep } from './expense-state';
import {
  validateDescription,
  parseAndValidateAmount,
  parseExpenseInput,
  ExpenseParseErrorType,
} from './expense-validation';
import { validateCustomSplits } from './split/custom';
import { calculatePercentageSplit } from './split/percentage';
import { calculateEqualSplit } from './split/equal';
import { calculateSharesSplit } from './split/shares';
import {
  QUICK_ADD_PROMPT,
  CMD_ADD_MISSING_AMOUNT_MESSAGE,
  CMD_ADD_INVALID_AMOUNT_MESSAGE,
  QUICK_ADD_MISSING_AMOUNT_MESSAGE,
  QUICK_ADD_INVALID_AMOUNT_MESSAGE,
  QUICK_ADD_MISSING_DESCRIPTION_MESSAGE,
  QUICK_ADD_MALFORMED_MESSAGE,
  UNEXPECTED_INPUT_MESSAGE,
  formatExpenseConfirmation,
} from '../../bot/messages/expense';
import {
  buildQuickAddKeyboard,
  buildExpenseConfirmationKeyboard,
  buildChangeMenuKeyboard,
  buildSplitTypeKeyboard,
  buildCancelRow,
} from '../../bot/keyboards';
import { formatPaise } from '../../shared/currency';
import { escapeMarkdown } from '../../shared/markdown';
import { ValidationError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { checkUserRateLimit, RATE_LIMIT_EXCEEDED_MESSAGE } from '../../shared/rate-limiter';

export function getCmdAddErrorMessage(errorType: ExpenseParseErrorType): string {
  switch (errorType) {
    case 'MISSING_AMOUNT':
      return CMD_ADD_MISSING_AMOUNT_MESSAGE;
    case 'INVALID_AMOUNT':
      return CMD_ADD_INVALID_AMOUNT_MESSAGE;
    case 'MISSING_DESCRIPTION':
      return QUICK_ADD_MISSING_DESCRIPTION_MESSAGE;
    default:
      return QUICK_ADD_MALFORMED_MESSAGE;
  }
}

export function getQuickAddErrorMessage(errorType: ExpenseParseErrorType): string {
  switch (errorType) {
    case 'MISSING_AMOUNT':
      return QUICK_ADD_MISSING_AMOUNT_MESSAGE;
    case 'INVALID_AMOUNT':
      return QUICK_ADD_INVALID_AMOUNT_MESSAGE;
    case 'MISSING_DESCRIPTION':
      return QUICK_ADD_MISSING_DESCRIPTION_MESSAGE;
    default:
      return QUICK_ADD_MALFORMED_MESSAGE;
  }
}

export function extractAddCommandArgs(ctx: Context): string {
  if (typeof (ctx as any).match === 'string' && (ctx as any).match.trim().length > 0) {
    return (ctx as any).match.trim();
  }
  const text = ctx.message?.text?.trim() || '';
  const match = text.match(/^\/add(?:@\w+)?(?:\s+(.*))?$/is);
  return match?.[1]?.trim() || '';
}

export async function showConfirmation(ctx: Context, draft: ExpenseDraft): Promise<void> {
  await ctx.reply(formatExpenseConfirmation(draft), {
    parse_mode: 'Markdown',
    reply_markup: buildExpenseConfirmationKeyboard(),
  });
}

/**
 * Starts quick-add mode (waiting for user to send text description and amount).
 * Used when user runs `/add` with no arguments or clicks `➕ Add Expense`.
 */
export async function startQuickAdd(
  ctx: Context,
  services: BotServices
): Promise<void> {
  const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

  if (!isGroup || !ctx.chat || !ctx.from) {
    await ctx.reply('⚠️ Expenses can only be added inside a group.');
    return;
  }

  try {
    const user = await services.userService.registerUser(ctx.from);
    const group = await services.groupService.registerGroup({
      id: ctx.chat.id,
      title: ctx.chat.title ?? null,
    });

    const displayName =
      [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || ctx.from.first_name;
    await services.groupService.registerMember(group.id, user.id, displayName);

    const activeMembers = await services.groupService.getActiveMembers(group.id);
    const memberIds = activeMembers.map((m) => m.userId);
    const defaultParticipantIds = memberIds.length > 0 ? memberIds : [user.id];

    const draft: ExpenseDraft = {
      chatId: ctx.chat.id,
      userId: ctx.from.id,
      groupId: group.id,
      creatorUserId: user.id,
      step: 'AWAITING_QUICK_ADD',
      payerUserId: user.id,
      payerName: displayName,
      participantUserIds: defaultParticipantIds,
      splitType: 'equal',
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expenseStateManager.setState(draft);

    await ctx.reply(QUICK_ADD_PROMPT, {
      parse_mode: 'Markdown',
      reply_markup: buildQuickAddKeyboard(),
    });
  } catch (error) {
    logger.error('Failed to start quick add:', error);
    await ctx.reply('❌ An error occurred while starting the expense flow. Please try again.');
  }
}

/**
 * Creates an expense draft directly from pre-parsed description and amount.
 * Moves directly to AWAITING_CONFIRMATION and displays the confirmation preview.
 */
export async function startExpenseFromParsedInput(
  ctx: Context,
  services: BotServices,
  parsed: { description: string; amountMinorUnits?: number; totalAmount?: number }
): Promise<ExpenseDraft | null> {
  const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

  if (!isGroup || !ctx.chat || !ctx.from) {
    await ctx.reply('⚠️ Expenses can only be added inside a group.');
    return null;
  }

  const amountPaise = parsed.amountMinorUnits ?? parsed.totalAmount ?? 0;

  try {
    const user = await services.userService.registerUser(ctx.from);
    const group = await services.groupService.registerGroup({
      id: ctx.chat.id,
      title: ctx.chat.title ?? null,
    });

    const displayName =
      [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || ctx.from.first_name;
    await services.groupService.registerMember(group.id, user.id, displayName);

    const activeMembers = await services.groupService.getActiveMembers(group.id);
    const memberIds = activeMembers.map((m) => m.userId);
    const defaultParticipantIds = memberIds.length > 0 ? memberIds : [user.id];

    const splitsCalculated = calculateEqualSplit(amountPaise, defaultParticipantIds);
    const splits = splitsCalculated.map((s) => {
      const m = activeMembers.find((mem) => mem.userId === s.userId);
      return {
        userId: s.userId,
        name: m?.displayName || (s.userId === user.id ? displayName : 'Member'),
        amount: s.amount,
      };
    });

    const draft: ExpenseDraft = {
      chatId: ctx.chat.id,
      userId: ctx.from.id,
      groupId: group.id,
      creatorUserId: user.id,
      step: 'AWAITING_CONFIRMATION',
      payerUserId: user.id,
      payerName: displayName,
      participantUserIds: defaultParticipantIds,
      splitType: 'equal',
      splits,
      description: parsed.description,
      totalAmount: amountPaise,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    expenseStateManager.setState(draft);
    await showConfirmation(ctx, draft);
    return draft;
  } catch (error) {
    logger.error('Failed to start expense from parsed input:', error);
    await ctx.reply('❌ An error occurred while creating the expense preview. Please try again.');
    return null;
  }
}

/**
 * Handles the /add command.
 * If arguments are present, parses them directly. If valid, creates draft and shows confirmation.
 * If arguments are missing, starts quick add mode.
 */
export async function handleAddCommand(
  ctx: Context,
  services: BotServices
): Promise<void> {
  if (ctx.from?.id) {
    const rateCheck = checkUserRateLimit(ctx.from.id, 'MUTATION');
    if (!rateCheck.allowed) {
      await ctx.reply(RATE_LIMIT_EXCEEDED_MESSAGE, { parse_mode: 'Markdown' });
      return;
    }
  }

  const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
  if (!isGroup || !ctx.chat || !ctx.from) {
    await ctx.reply('⚠️ Expenses can only be added inside a group.');
    return;
  }

  const args = extractAddCommandArgs(ctx);

  if (args.length > 0) {
    const parseResult = parseExpenseInput(args);
    if (!parseResult.success) {
      // Actionable error for command input. Do NOT create draft or set state.
      await ctx.reply(getCmdAddErrorMessage(parseResult.errorType), {
        parse_mode: 'Markdown',
      });
      return;
    }

    await startExpenseFromParsedInput(ctx, services, parseResult);
    return;
  }

  await startQuickAdd(ctx, services);
}

/**
 * Backward-compatible entry point that delegates to handleAddCommand or startQuickAdd.
 */
export async function startExpenseFlow(
  ctx: Context,
  services: BotServices,
  initialText?: string
): Promise<void> {
  const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
  if (!isGroup || !ctx.chat || !ctx.from) {
    await ctx.reply('⚠️ Expenses can only be added inside a group.');
    return;
  }

  const trimmed = initialText?.trim();
  if (trimmed) {
    const parseResult = parseExpenseInput(trimmed);
    if (!parseResult.success) {
      await ctx.reply(getCmdAddErrorMessage(parseResult.errorType), {
        parse_mode: 'Markdown',
      });
      return;
    }

    await startExpenseFromParsedInput(ctx, services, parseResult);
    return;
  }

  await startQuickAdd(ctx, services);
}

/**
 * Handles incoming text messages when an expense creation flow is active
 */
export async function handleExpenseTextInput(
  ctx: Context,
  services: BotServices
): Promise<boolean> {
  if (!ctx.chat || !ctx.from || !ctx.message?.text) {
    return false;
  }

  const text = ctx.message.text.trim();

  // If user typed /cancel, clear state and let cancel command execute
  if (text.startsWith('/cancel')) {
    expenseStateManager.clearState(ctx.chat.id, ctx.from.id);
    return false;
  }

  const draft = expenseStateManager.getState(ctx.chat.id, ctx.from.id);
  if (!draft) {
    return false;
  }

  // Allow other slash commands to pass through
  if (text.startsWith('/')) {
    return false;
  }

  try {
    switch (draft.step) {
      case 'AWAITING_QUICK_ADD': {
        const parseResult = parseExpenseInput(text);

        if (!parseResult.success) {
          await ctx.reply(getQuickAddErrorMessage(parseResult.errorType), {
            parse_mode: 'Markdown',
            reply_markup: buildQuickAddKeyboard(),
          });
          return true;
        }

        const activeMembers = await services.groupService.getActiveMembers(draft.groupId);
        const splitsCalculated = calculateEqualSplit(parseResult.totalAmount, draft.participantUserIds);
        const splits = splitsCalculated.map((s) => {
          const m = activeMembers.find((mem) => mem.userId === s.userId);
          return {
            userId: s.userId,
            name: m?.displayName || (s.userId === draft.creatorUserId ? draft.payerName || 'Member' : 'Member'),
            amount: s.amount,
          };
        });

        const updatedDraft = expenseStateManager.updateState(ctx.chat.id, ctx.from.id, {
          description: parseResult.description,
          totalAmount: parseResult.totalAmount,
          splitType: 'equal',
          splits,
          step: 'AWAITING_CONFIRMATION',
        });

        if (updatedDraft) await showConfirmation(ctx, updatedDraft);
        return true;
      }

      case 'AWAITING_NEW_DESCRIPTION': {
        const newDescription = validateDescription(text);
        const updatedDraft = expenseStateManager.updateState(ctx.chat.id, ctx.from.id, {
          description: newDescription,
          step: 'AWAITING_CONFIRMATION',
        });

        if (updatedDraft) await showConfirmation(ctx, updatedDraft);
        return true;
      }

      case 'AWAITING_NEW_AMOUNT': {
        const newAmount = parseAndValidateAmount(text);
        const activeMembers = await services.groupService.getActiveMembers(draft.groupId);

        let updatedSplits = draft.splits;
        let splitType = draft.splitType || 'equal';

        if (splitType === 'shares' && draft.sharesMap) {
          const shareInputs = draft.participantUserIds.map((uId) => ({
            userId: uId,
            shares: draft.sharesMap![uId] ?? 1,
          }));
          const calc = calculateSharesSplit(newAmount, shareInputs);
          updatedSplits = calc.map((c) => {
            const m = activeMembers.find((mem) => mem.userId === c.userId);
            return {
              userId: c.userId,
              name: m?.displayName || 'Member',
              amount: c.amount,
              shares: c.shares,
            };
          });
        } else {
          splitType = 'equal';
          const calc = calculateEqualSplit(newAmount, draft.participantUserIds);
          updatedSplits = calc.map((s) => {
            const m = activeMembers.find((mem) => mem.userId === s.userId);
            return {
              userId: s.userId,
              name: m?.displayName || 'Member',
              amount: s.amount,
            };
          });
        }

        const updatedDraft = expenseStateManager.updateState(ctx.chat.id, ctx.from.id, {
          totalAmount: newAmount,
          splits: updatedSplits,
          splitType,
          step: 'AWAITING_CONFIRMATION',
        });

        if (updatedDraft) await showConfirmation(ctx, updatedDraft);
        return true;
      }

      case 'AWAITING_CUSTOM_SPLIT': {
        const shareAmount = parseAndValidateAmount(text);
        const index = draft.customSplitIndex ?? 0;
        const participantId = draft.participantUserIds[index];

        const activeMembers = await services.groupService.getActiveMembers(draft.groupId);
        const currentMember = activeMembers.find((m) => m.userId === participantId);
        const memberName = currentMember?.displayName || 'Member';

        const updatedSplits = [
          ...draft.splits,
          { userId: participantId, name: memberName, amount: shareAmount },
        ];
        const nextIndex = index + 1;

        if (nextIndex < draft.participantUserIds.length) {
          const nextId = draft.participantUserIds[nextIndex];
          const nextMember = activeMembers.find((m) => m.userId === nextId);
          const nextName = nextMember?.displayName || 'Member';

          expenseStateManager.updateState(ctx.chat.id, ctx.from.id, {
            splits: updatedSplits,
            customSplitIndex: nextIndex,
          });

          await ctx.reply(`💰 Enter *${escapeMarkdown(nextName)}*'s share in ₹:`, {
            parse_mode: 'Markdown',
            reply_markup: buildCancelRow('exp:cancel'),
          });
        } else {
          const validation = validateCustomSplits(draft.totalAmount!, updatedSplits);
          if (!validation.isValid) {
            const diffPaise = Math.abs(validation.difference);
            const status = validation.difference > 0 ? 'short' : 'over';

            expenseStateManager.updateState(ctx.chat.id, ctx.from.id, {
              splits: [],
              customSplitIndex: 0,
            });

            const firstMember = activeMembers.find((m) => m.userId === draft.participantUserIds[0]);
            const firstName = firstMember?.displayName || 'First participant';

            await ctx.reply(
              `❌ The split total is ${formatPaise(diffPaise)} ${status} of the total amount (${formatPaise(draft.totalAmount!)}).\n\nLet's re-enter the custom amounts.\n\n💰 Enter *${escapeMarkdown(firstName)}*'s share in ₹:`,
              {
                parse_mode: 'Markdown',
                reply_markup: buildCancelRow('exp:cancel'),
              }
            );
            return true;
          }

          const updatedDraft = expenseStateManager.updateState(ctx.chat.id, ctx.from.id, {
            splits: updatedSplits,
            step: 'AWAITING_CONFIRMATION',
          });

          if (updatedDraft) await showConfirmation(ctx, updatedDraft);
        }
        return true;
      }

      case 'AWAITING_PERCENTAGE_SPLIT': {
        const percentage = parseFloat(text.replace('%', '').trim());
        if (isNaN(percentage) || percentage < 0 || percentage > 100) {
          await ctx.reply('❌ Please enter a valid percentage between 0 and 100 (e.g. 25 or 33.33):', {
            reply_markup: buildCancelRow('exp:cancel'),
          });
          return true;
        }

        const index = draft.customSplitIndex ?? 0;
        const participantId = draft.participantUserIds[index];

        const activeMembers = await services.groupService.getActiveMembers(draft.groupId);
        const currentMember = activeMembers.find((m) => m.userId === participantId);
        const memberName = currentMember?.displayName || 'Member';

        const updatedSplits = [
          ...draft.splits,
          { userId: participantId, name: memberName, amount: 0, percentage },
        ];
        const nextIndex = index + 1;

        if (nextIndex < draft.participantUserIds.length) {
          const nextId = draft.participantUserIds[nextIndex];
          const nextMember = activeMembers.find((m) => m.userId === nextId);
          const nextName = nextMember?.displayName || 'Member';

          expenseStateManager.updateState(ctx.chat.id, ctx.from.id, {
            splits: updatedSplits,
            customSplitIndex: nextIndex,
          });

          await ctx.reply(`📊 Enter *${escapeMarkdown(nextName)}*'s share percentage (0-100%):`, {
            parse_mode: 'Markdown',
            reply_markup: buildCancelRow('exp:cancel'),
          });
        } else {
          const percentageInputs = updatedSplits.map((s) => ({
            userId: s.userId,
            percentage: s.percentage!,
          }));

          try {
            const calculated = calculatePercentageSplit(draft.totalAmount!, percentageInputs);
            const finalSplits = calculated.map((c) => {
              const member = activeMembers.find((m) => m.userId === c.userId);
              return {
                userId: c.userId,
                name: member?.displayName || 'Member',
                amount: c.amount,
                percentage: c.percentage,
              };
            });

            const updatedDraft = expenseStateManager.updateState(ctx.chat.id, ctx.from.id, {
              splits: finalSplits,
              step: 'AWAITING_CONFIRMATION',
            });

            if (updatedDraft) await showConfirmation(ctx, updatedDraft);
          } catch (err: any) {
            expenseStateManager.updateState(ctx.chat.id, ctx.from.id, {
              splits: [],
              customSplitIndex: 0,
            });

            const firstMember = activeMembers.find((m) => m.userId === draft.participantUserIds[0]);
            const firstName = firstMember?.displayName || 'First participant';

            await ctx.reply(
              `❌ ${err.message || 'Total percentages must equal 100%'}.\n\nLet's re-enter percentages.\n\n📊 Enter *${escapeMarkdown(firstName)}*'s share percentage (0-100%):`,
              {
                parse_mode: 'Markdown',
                reply_markup: buildCancelRow('exp:cancel'),
              }
            );
          }
        }
        return true;
      }

      default: {
        const markup = getKeyboardForStep(draft.step);
        await ctx.reply(UNEXPECTED_INPUT_MESSAGE, {
          parse_mode: 'Markdown',
          reply_markup: markup,
        });
        return true;
      }
    }
  } catch (err: any) {
    logger.error('Error handling expense text input:', err);
    const isUserValidation = err instanceof ValidationError;
    const msg = isUserValidation
      ? `❌ ${err.message}`
      : '❌ An error occurred. Please try again.';

    await ctx.reply(msg, {
      reply_markup: buildCancelRow('exp:cancel'),
    });
    return true;
  }
}

function getKeyboardForStep(step: ExpenseFlowStep) {
  switch (step) {
    case 'CHANGE_MENU':
      return buildChangeMenuKeyboard();
    case 'AWAITING_SPLIT_TYPE':
      return buildSplitTypeKeyboard();
    case 'AWAITING_QUICK_ADD':
      return buildQuickAddKeyboard();
    default:
      return buildExpenseConfirmationKeyboard();
  }
}
