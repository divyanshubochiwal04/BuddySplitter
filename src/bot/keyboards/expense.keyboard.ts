import { InlineKeyboard } from 'grammy';

export interface MemberOption {
  userId: string;
  name: string;
}

export function buildPayerSelectionKeyboard(
  creatorMember: MemberOption,
  allMembers: MemberOption[]
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  // Highlight creator button
  keyboard.text(`👤 ${creatorMember.name} (You)`, `payer:select:${creatorMember.userId}`).row();

  // If more members exist, allow choosing from list
  if (allMembers.length > 1) {
    keyboard.text('👥 Choose Member', 'payer:list').row();
  }

  keyboard.text('❌ Cancel', 'exp:cancel');
  return keyboard;
}

export function buildPayerListKeyboard(members: MemberOption[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const member of members) {
    keyboard.text(member.name, `payer:select:${member.userId}`).row();
  }

  keyboard.text('◀️ Back', 'payer:back').text('❌ Cancel', 'exp:cancel');
  return keyboard;
}

export function buildParticipantsSelectionKeyboard(
  members: MemberOption[],
  selectedUserIds: Set<string>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  // Quick select everyone button
  keyboard.text('✅ Everyone', 'part:everyone').row();

  // Toggle buttons for each member
  for (const member of members) {
    const isSelected = selectedUserIds.has(member.userId);
    const check = isSelected ? '☑' : '☐';
    keyboard.text(`${check} ${member.name}`, `part:toggle:${member.userId}`).row();
  }

  keyboard.text('➡️ Continue', 'part:continue').text('❌ Cancel', 'exp:cancel');
  return keyboard;
}

export function buildSplitTypeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('⚖️ Equal', 'split:equal')
    .text('💰 Custom', 'split:custom')
    .row()
    .text('📊 Percentage', 'split:percentage')
    .row()
    .text('❌ Cancel', 'exp:cancel');
}

export function buildExpenseConfirmationKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Save Expense', 'exp:confirm')
    .row()
    .text('✏️ Edit', 'exp:edit')
    .text('❌ Cancel', 'exp:cancel');
}
