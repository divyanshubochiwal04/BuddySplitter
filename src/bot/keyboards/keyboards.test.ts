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
} from './index';

describe('Keyboard Builders', () => {
  it('builds private menu with dynamic bot username add-to-group URL', () => {
    const keyboard = buildPrivateMenuKeyboard('MyTestBot');
    const buttons = keyboard.inline_keyboard.flat();

    const addGroupBtn = buttons.find((b) => b.text.includes('Add to Group'));
    expect(addGroupBtn).toBeDefined();
    expect('url' in addGroupBtn! && addGroupBtn.url).toBe('https://t.me/MyTestBot?startgroup=true');

    const helpBtn = buttons.find((b) => b.text.includes('Help'));
    expect(helpBtn).toBeDefined();
    expect('callback_data' in helpBtn! && helpBtn.callback_data).toBe('menu:help');
  });

  it('builds private menu with fallback callback if username is absent', () => {
    const keyboard = buildPrivateMenuKeyboard();
    const buttons = keyboard.inline_keyboard.flat();
    const addGroupBtn = buttons.find((b) => b.text.includes('Add to Group'));
    expect(addGroupBtn).toBeDefined();
    expect('callback_data' in addGroupBtn! && addGroupBtn.callback_data).toBe('menu:add_to_group');
  });

  it('builds group menu with all 6 required buttons', () => {
    const keyboard = buildGroupMenuKeyboard();
    const buttons = keyboard.inline_keyboard.flat();

    expect(buttons).toHaveLength(6);
    expect(buttons.map((b) => b.text)).toEqual([
      '➕ Add Expense',
      '💰 My Balance',
      '📊 Summary',
      '💸 Settle Up',
      '📜 Expenses',
      '👥 Members',
    ]);
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
});
