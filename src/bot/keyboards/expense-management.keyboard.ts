import { InlineKeyboard } from 'grammy';
import { ExpenseListItem } from '../../modules/expenses/expense.types';
import { formatPaise } from '../../shared/currency';

export function buildExpenseHistoryKeyboard(
  expenses: ExpenseListItem[],
  page: number,
  totalPages: number
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  // One button per expense
  for (let i = 0; i < expenses.length; i++) {
    const expense = expenses[i];
    const index = (page - 1) * 5 + i + 1;
    const truncatedDesc =
      expense.description.length > 20
        ? `${expense.description.slice(0, 18)}...`
        : expense.description;
    const buttonText = `🔍 ${index}. ${truncatedDesc} (${formatPaise(expense.totalAmount)})`;
    keyboard.text(buttonText, `expm:v:${expense.id}:${page}`).row();
  }

  // Pagination navigation row
  if (totalPages > 1) {
    if (page > 1) {
      keyboard.text('⬅️ Prev', `expm:p:${page - 1}`);
    }
    keyboard.text(`${page} / ${totalPages}`, 'expm:noop');
    if (page < totalPages) {
      keyboard.text('Next ➡️', `expm:p:${page + 1}`);
    }
    keyboard.row();
  }

  // Action navigation row
  keyboard.text('➕ Add Expense', 'action:add_expense').text('🏠 Menu', 'menu:group');

  return keyboard;
}

export function buildExpenseDetailsKeyboard(
  expenseId: string,
  page: number,
  canManage: boolean
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (canManage) {
    keyboard
      .text('✏️ Edit', `expm:em:${expenseId}:${page}`)
      .text('🗑 Delete', `expm:dp:${expenseId}:${page}`)
      .row();
  }

  keyboard.text('⬅️ Back to Expenses', `expm:p:${page}`);
  return keyboard;
}

export function buildDeleteConfirmationKeyboard(
  expenseId: string,
  page: number
): InlineKeyboard {
  return new InlineKeyboard()
    .text('❌ Cancel', `expm:v:${expenseId}:${page}`)
    .text('🗑 Confirm Delete', `expm:dc:${expenseId}:${page}`);
}

export function buildEditMenuKeyboard(
  expenseId: string,
  page: number,
  hasRepayments: boolean
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  keyboard.text('📝 Edit Description', `expm:ed:${expenseId}:${page}`).row();

  if (!hasRepayments) {
    keyboard.text('💰 Edit Amount & Splits', `expm:ef:${expenseId}:${page}`).row();
  }

  keyboard.text('⬅️ Back to Expense', `expm:v:${expenseId}:${page}`);
  return keyboard;
}

export function buildCancelEditDescriptionKeyboard(
  expenseId: string,
  page: number
): InlineKeyboard {
  return new InlineKeyboard().text('❌ Cancel', `expm:v:${expenseId}:${page}`);
}

export function buildExpenseDeletedKeyboard(page: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('📋 Back to Expenses', `expm:p:${page}`)
    .text('📊 Summary', 'action:summary');
}
