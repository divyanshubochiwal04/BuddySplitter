import { describe, it, expect } from 'vitest';
import {
  buildPrivateMenuKeyboard,
  buildGroupMenuKeyboard,
  buildBackRow,
  buildCancelRow,
  buildBackAndCancelRow,
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
});
