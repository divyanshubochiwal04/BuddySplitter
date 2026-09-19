import { describe, it, expect } from 'vitest';
import {
  buildPrivateMenuKeyboard,
  buildGroupMenuKeyboard,
  buildBackRow,
  buildCancelRow,
  buildBackAndCancelRow,
  buildSplitTypeKeyboard,
  buildSharesKeyboard,
  buildExpenseConfirmationKeyboard,
  buildExpenseHistoryKeyboard,
  buildExpenseDetailsKeyboard,
  buildDeleteConfirmationKeyboard,
  buildEditMenuKeyboard,
} from './index';

describe('Keyboard Builders', () => {
  it('builds private menu with dynamic bot username add-to-group URL', () => {
    const keyboard = buildPrivateMenuKeyboard('MyTestBot');
    const buttons = keyboard.inline_keyboard.flat();

    const addGroupBtn = buttons.find((b) => b.text.includes('Add BuddySplitter to a Group'));
    expect(addGroupBtn).toBeDefined();
    expect('url' in addGroupBtn! && addGroupBtn.url).toBe('https://t.me/MyTestBot?startgroup=true');

    const helpBtn = buttons.find((b) => b.text.includes('How it Works'));
    expect(helpBtn).toBeDefined();
    expect('callback_data' in helpBtn! && helpBtn.callback_data).toBe('menu:help');
  });

  it('builds private menu with fallback callback if username is absent', () => {
    const keyboard = buildPrivateMenuKeyboard();
    const buttons = keyboard.inline_keyboard.flat();
    const addGroupBtn = buttons.find((b) => b.text.includes('Add BuddySplitter to a Group'));
    expect(addGroupBtn).toBeDefined();
    expect('callback_data' in addGroupBtn! && addGroupBtn.callback_data).toBe('menu:add_to_group');
  });

  it('builds group menu with all 8 required buttons in compact layout', () => {
    const keyboard = buildGroupMenuKeyboard();
    const buttons = keyboard.inline_keyboard.flat();

    expect(buttons).toHaveLength(8);
    const texts = buttons.map((b) => b.text);
    expect(texts).toContain('➕ Add Expense');
    expect(texts).toContain('📋 Expenses');
    expect(texts).toContain('💰 My Balance');
    expect(texts).toContain('📊 Group Summary');
    expect(texts).toContain('💸 Settle Up');
    expect(texts).toContain('💳 Payments');
    expect(texts).toContain('👥 Members');
    expect(texts).toContain('❓ Help');

    // Verify callback data for new buttons
    const paymentsBtn = buttons.find((b) => b.text === '💳 Payments');
    expect('callback_data' in paymentsBtn! && paymentsBtn.callback_data).toBe('action:payments');

    const helpBtn = buttons.find((b) => b.text === '❓ Help');
    expect('callback_data' in helpBtn! && helpBtn.callback_data).toBe('menu:help');

    const summaryBtn = buttons.find((b) => b.text === '📊 Group Summary');
    expect('callback_data' in summaryBtn! && summaryBtn.callback_data).toBe('action:summary');
  });


  it('builds back and cancel keyboards', () => {
    const backKb = buildBackRow('menu:custom');
    expect(backKb.inline_keyboard[0][0].text).toContain('Back');
    expect('callback_data' in backKb.inline_keyboard[0][0] && backKb.inline_keyboard[0][0].callback_data).toBe('menu:custom');

    const cancelKb = buildCancelRow('action:cancel');
    expect(cancelKb.inline_keyboard[0][0].text).toContain('Cancel');

    const combinedKb = buildBackAndCancelRow('menu:group', 'action:cancel');
    expect(combinedKb.inline_keyboard[0]).toHaveLength(2);
  });

  it('builds split type keyboard with Equal, Amounts, Percentage, and Shares options', () => {
    const splitKb = buildSplitTypeKeyboard();
    const buttons = splitKb.inline_keyboard.flat();

    const splitEqual = buttons.find((b) => 'callback_data' in b && b.callback_data === 'split:equal');
    const splitCustom = buttons.find((b) => 'callback_data' in b && b.callback_data === 'split:custom');
    const splitPercentage = buttons.find((b) => 'callback_data' in b && b.callback_data === 'split:percentage');
    const splitShares = buttons.find((b) => 'callback_data' in b && b.callback_data === 'split:shares');

    expect(splitEqual).toBeDefined();
    expect(splitCustom).toBeDefined();
    expect(splitPercentage).toBeDefined();
    expect(splitShares).toBeDefined();
    expect(splitShares?.text).toContain('Shares');
  });

  it('builds shares stepper keyboard for participants with +/- and continue buttons', () => {
    const members = [
      { userId: 'u1', name: 'Dev' },
      { userId: 'u2', name: 'Rahul' },
    ];
    const sharesMap = { u1: 2, u2: 1 };

    const sharesKb = buildSharesKeyboard(members, sharesMap);
    const buttons = sharesKb.inline_keyboard.flat();

    // Contains dec and inc buttons for u1 and u2
    expect(buttons.some((b) => 'callback_data' in b && b.callback_data === 'share:dec:u1')).toBe(true);
    expect(buttons.some((b) => 'callback_data' in b && b.callback_data === 'share:inc:u1')).toBe(true);
    expect(buttons.some((b) => 'callback_data' in b && b.callback_data === 'share:dec:u2')).toBe(true);
    expect(buttons.some((b) => 'callback_data' in b && b.callback_data === 'share:inc:u2')).toBe(true);

    // Displays current share counts
    expect(buttons.some((b) => b.text === '2 shares')).toBe(true);
    expect(buttons.some((b) => b.text === '1 share')).toBe(true);

    // Contains continue and cancel
    expect(buttons.some((b) => 'callback_data' in b && b.callback_data === 'share:continue')).toBe(true);
    expect(buttons.some((b) => 'callback_data' in b && b.callback_data === 'exp:cancel')).toBe(true);
  });

  it('builds confirmation keyboard with Change Split, Change Participants, and Change Payer', () => {
    const confKb = buildExpenseConfirmationKeyboard();
    const buttons = confKb.inline_keyboard.flat();

    expect(buttons.some((b) => 'callback_data' in b && b.callback_data === 'exp:confirm')).toBe(true);
    expect(buttons.some((b) => 'callback_data' in b && b.callback_data === 'exp:change_split')).toBe(true);
    expect(buttons.some((b) => 'callback_data' in b && b.callback_data === 'exp:change_participants')).toBe(true);
    expect(buttons.some((b) => 'callback_data' in b && b.callback_data === 'exp:change_payer')).toBe(true);
    expect(buttons.some((b) => 'callback_data' in b && b.callback_data === 'exp:cancel')).toBe(true);
  });

  it('builds expense history keyboard with pagination controls', () => {
    const expenses = [
      {
        id: 'exp-1',
        description: 'Pizza Dinner',
        totalAmount: 2000,
        currency: 'INR',
        paidByUserId: 'u1',
        payerName: 'Alice',
        expenseDate: '2026-09-19T10:00:00Z',
        createdAt: '2026-09-19T10:00:00Z',
      },
    ];

    const kb = buildExpenseHistoryKeyboard(expenses, 1, 3);
    const buttons = kb.inline_keyboard.flat();

    expect(buttons.some((b) => 'callback_data' in b && b.callback_data === 'expm:v:exp-1:1')).toBe(true);
    expect(buttons.some((b) => b.text.includes('1 / 3'))).toBe(true);
    expect(buttons.some((b) => 'callback_data' in b && b.callback_data === 'expm:p:2')).toBe(true);
    expect(buttons.some((b) => 'callback_data' in b && b.callback_data === 'action:add_expense')).toBe(true);
  });

  it('builds expense details keyboard with appropriate actions based on canManage', () => {
    const manageKb = buildExpenseDetailsKeyboard('exp-1', 2, true);
    const manageBtns = manageKb.inline_keyboard.flat();
    expect(manageBtns.some((b) => 'callback_data' in b && b.callback_data === 'expm:em:exp-1:2')).toBe(true);
    expect(manageBtns.some((b) => 'callback_data' in b && b.callback_data === 'expm:dp:exp-1:2')).toBe(true);
    expect(manageBtns.some((b) => 'callback_data' in b && b.callback_data === 'expm:p:2')).toBe(true);

    const readOnlyKb = buildExpenseDetailsKeyboard('exp-1', 2, false);
    const readOnlyBtns = readOnlyKb.inline_keyboard.flat();
    expect(readOnlyBtns.some((b) => 'callback_data' in b && b.callback_data === 'expm:em:exp-1:2')).toBe(false);
    expect(readOnlyBtns.some((b) => 'callback_data' in b && b.callback_data === 'expm:dp:exp-1:2')).toBe(false);
    expect(readOnlyBtns.some((b) => 'callback_data' in b && b.callback_data === 'expm:p:2')).toBe(true);
  });

  it('builds delete confirmation keyboard with Cancel and Confirm Delete', () => {
    const kb = buildDeleteConfirmationKeyboard('exp-1', 1);
    const buttons = kb.inline_keyboard.flat();
    expect(buttons.some((b) => 'callback_data' in b && b.callback_data === 'expm:v:exp-1:1')).toBe(true);
    expect(buttons.some((b) => 'callback_data' in b && b.callback_data === 'expm:dc:exp-1:1')).toBe(true);
  });

  it('builds edit menu keyboard conditionally offering financial editing based on repayments', () => {
    const withoutRepayments = buildEditMenuKeyboard('exp-1', 1, false);
    const btns1 = withoutRepayments.inline_keyboard.flat();
    expect(btns1.some((b) => 'callback_data' in b && b.callback_data === 'expm:ed:exp-1:1')).toBe(true);
    expect(btns1.some((b) => 'callback_data' in b && b.callback_data === 'expm:ef:exp-1:1')).toBe(true);

    const withRepayments = buildEditMenuKeyboard('exp-1', 1, true);
    const btns2 = withRepayments.inline_keyboard.flat();
    expect(btns2.some((b) => 'callback_data' in b && b.callback_data === 'expm:ed:exp-1:1')).toBe(true);
    expect(btns2.some((b) => 'callback_data' in b && b.callback_data === 'expm:ef:exp-1:1')).toBe(false);
  });
});
