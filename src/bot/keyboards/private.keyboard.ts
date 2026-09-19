import { InlineKeyboard } from 'grammy';

export function buildPrivateMenuKeyboard(botUsername?: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (botUsername) {
    keyboard.url('➕ Add BuddySplitter to a Group', `https://t.me/${botUsername}?startgroup=true`);
  } else {
    keyboard.text('➕ Add BuddySplitter to a Group', 'menu:add_to_group');
  }

  keyboard.row().text('❓ How it Works', 'menu:help');

  return keyboard;
}
