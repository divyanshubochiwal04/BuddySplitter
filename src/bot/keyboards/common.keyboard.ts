import { InlineKeyboard } from 'grammy';

export function buildBackRow(backCallbackData = 'menu:group'): InlineKeyboard {
  return new InlineKeyboard().text('◀️ Back', backCallbackData);
}

export function buildCancelRow(cancelCallbackData = 'action:cancel'): InlineKeyboard {
  return new InlineKeyboard().text('❌ Cancel', cancelCallbackData);
}

export function buildBackAndCancelRow(
  backCallbackData = 'menu:group',
  cancelCallbackData = 'action:cancel'
): InlineKeyboard {
  return new InlineKeyboard()
    .text('◀️ Back', backCallbackData)
    .text('❌ Cancel', cancelCallbackData);
}
