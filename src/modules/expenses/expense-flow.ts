import { Context } from 'grammy';
import { BotServices } from '../services';
import { expenseStateManager, ExpenseDraft } from './expense-state';
import {
  validateDescription,
  parseAndValidateAmount,
} from './expense-validation';
import { validateCustomSplits } from './split/custom';
import { calculatePercentageSplit } from './split/percentage';
import {
  EXPENSE_DESCRIPTION_PROMPT,
  EXPENSE_AMOUNT_PROMPT,
  formatPayerPrompt,
  formatExpenseConfirmation,
} from '../../bot/messages/expense';
import {
  buildCancelRow,
  buildPayerSelectionKeyboard,
  buildExpenseConfirmationKeyboard,
  MemberOption,
} from '../../bot/keyboards';
import { formatPaise } from '../../shared/currency';
import { logger } from '../../shared/logger';

/**
 * Initiates the multi-step expense creation flow
 */
export async function startExpenseFlow(ctx: Context, services: BotServices): Promise<void> {
  const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

  if (!isGroup || !ctx.chat || !ctx.from) {
    await ctx.reply('⚠️ Expenses can only be added inside a group.');
    return;
  }

  try {
    // 1. Ensure user and group are registered in database
    const user = await services.userService.registerUser(ctx.from);
    const group = await services.groupService.registerGroup({
      id: ctx.chat.id,
      title: ctx.chat.title ?? null,
    });

    const displayName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || ctx.from.first_name;
    await services.groupService.registerMember(group.id, user.id, displayName);

    // 2. Initialize conversation state for this user in this group
    const initialDraft: ExpenseDraft = {
      chatId: ctx.chat.id,
      userId: ctx.from.id,
      groupId: group.id,
      creatorUserId: user.id,
      step: 'AWAITING_DESCRIPTION',
      participantUserIds: [],
      splits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    expenseStateManager.setState(initialDraft);

    // 3. Prompt user for Step 1: Description
    await ctx.reply(EXPENSE_DESCRIPTION_PROMPT, {
      parse_mode: 'Markdown',
      reply_markup: buildCancelRow('exp:cancel'),
    });
  } catch (error) {
    logger.error('Failed to start expense flow:', error);
    await ctx.reply('❌ An error occurred while starting the expense flow. Please try again.');
  }
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

  // If user typed /cancel, let the cancel handler clear the draft
  if (text.startsWith('/cancel')) {
    expenseStateManager.clearState(ctx.chat.id, ctx.from.id);
    return false;
  }

  const draft = expenseStateManager.getState(ctx.chat.id, ctx.from.id);
  if (!draft) {
    return false;
  }

  // If another slash command was typed, ignore or let it route
  if (text.startsWith('/')) {
    return false;
  }

  try {
    switch (draft.step) {
      case 'AWAITING_DESCRIPTION': {
        const description = validateDescription(text);
        expenseStateManager.updateState(ctx.chat.id, ctx.from.id, {
          description,
          step: 'AWAITING_AMOUNT',
        });

        await ctx.reply(EXPENSE_AMOUNT_PROMPT, {
          parse_mode: 'Markdown',
          reply_markup: buildCancelRow('exp:cancel'),
        });
        return true;
      }

      case 'AWAITING_AMOUNT': {
        const totalAmount = parseAndValidateAmount(text);

        // Fetch active group members
        const activeMembers = await services.groupService.getActiveMembers(draft.groupId);
        const memberOptions: MemberOption[] = await Promise.all(
          activeMembers.map(async (m) => {
            const u = await services.userService.getUserById(m.userId);
            return {
              userId: m.userId,
              name: m.displayName || u?.firstName || 'Member',
            };
          })
        );

        const creatorOption =
          memberOptions.find((m) => m.userId === draft.creatorUserId) || {
            userId: draft.creatorUserId,
            name: ctx.from.first_name,
          };

        expenseStateManager.updateState(ctx.chat.id, ctx.from.id, {
          totalAmount,
          payerUserId: creatorOption.userId,
          payerName: creatorOption.name,
          step: 'AWAITING_PAYER',
        });

        await ctx.reply(formatPayerPrompt(totalAmount), {
          parse_mode: 'Markdown',
          reply_markup: buildPayerSelectionKeyboard(creatorOption, memberOptions),
        });
        return true;
      }

      case 'AWAITING_CUSTOM_SPLIT': {
        const shareAmount = parseAndValidateAmount(text);
        const index = draft.customSplitIndex ?? 0;
        const participantId = draft.participantUserIds[index];

        const activeMembers = await services.groupService.getActiveMembers(draft.groupId);
        const currentMember = activeMembers.find((m) => m.userId === participantId);
        const memberName = currentMember?.displayName || 'Member';

        const updatedSplits = [...draft.splits, { userId: participantId, name: memberName, amount: shareAmount }];
        const nextIndex = index + 1;

        if (nextIndex < draft.participantUserIds.length) {
          const nextId = draft.participantUserIds[nextIndex];
          const nextMember = activeMembers.find((m) => m.userId === nextId);
          const nextName = nextMember?.displayName || 'Member';

          expenseStateManager.updateState(ctx.chat.id, ctx.from.id, {
            splits: updatedSplits,
            customSplitIndex: nextIndex,
          });

          await ctx.reply(`💰 Enter *${nextName}*'s share in ₹:`, {
            parse_mode: 'Markdown',
            reply_markup: buildCancelRow('exp:cancel'),
          });
        } else {
          // All participant amounts entered; validate custom splits
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
              `❌ The split total is ${formatPaise(diffPaise)} ${status} of the total amount (${formatPaise(draft.totalAmount!)}).\n\nLet's re-enter the custom amounts.\n\n💰 Enter *${firstName}*'s share in ₹:`,
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

          if (updatedDraft) {
            await ctx.reply(formatExpenseConfirmation(updatedDraft), {
              parse_mode: 'Markdown',
              reply_markup: buildExpenseConfirmationKeyboard(),
            });
          }
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

          await ctx.reply(`📊 Enter *${nextName}*'s share percentage (0-100%):`, {
            parse_mode: 'Markdown',
            reply_markup: buildCancelRow('exp:cancel'),
          });
        } else {
          // All percentages entered; calculate splits via Largest Remainder Method
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

            if (updatedDraft) {
              await ctx.reply(formatExpenseConfirmation(updatedDraft), {
                parse_mode: 'Markdown',
                reply_markup: buildExpenseConfirmationKeyboard(),
              });
            }
          } catch (err: any) {
            expenseStateManager.updateState(ctx.chat.id, ctx.from.id, {
              splits: [],
              customSplitIndex: 0,
            });

            const firstMember = activeMembers.find((m) => m.userId === draft.participantUserIds[0]);
            const firstName = firstMember?.displayName || 'First participant';

            await ctx.reply(
              `❌ ${err.message || 'Total percentages must equal 100%'}.\n\nLet's re-enter percentages.\n\n📊 Enter *${firstName}*'s share percentage (0-100%):`,
              {
                parse_mode: 'Markdown',
                reply_markup: buildCancelRow('exp:cancel'),
              }
            );
          }
        }
        return true;
      }

      default:
        return false;
    }
  } catch (err: any) {
    await ctx.reply(`❌ ${err.message || 'Invalid input'}. Please try again:`, {
      reply_markup: buildCancelRow('exp:cancel'),
    });
    return true;
  }
}
