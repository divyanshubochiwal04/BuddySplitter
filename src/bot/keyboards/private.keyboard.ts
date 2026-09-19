import { InlineKeyboard } from 'grammy';

export function buildPrivateMenuKeyboard(botUsername?: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (botUsername) {
    keyboard.url('➕ Add to Group', `https://t.me/${botUsername}?startgroup=true`);
  } else {
    keyboard.text('➕ Add to Group', 'menu:add_to_group');
  }

  keyboard.row().text('❓ Help', 'menu:help');

  return keyboard;
}
