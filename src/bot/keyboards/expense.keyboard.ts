import { InlineKeyboard } from 'grammy';
import { formatPaise } from '../../shared/currency';
import { ExpenseDraft } from '../../modules/expenses/expense-state';

export interface MemberOption {
  userId: string;
  name: string;
}

export function buildQuickAddKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('❌ Cancel', 'exp:cancel');
}

export function buildExpenseConfirmationKeyboard(
  draft?: ExpenseDraft,
  members?: MemberOption[]
): InlineKeyboard {
  if (!draft || !members || members.length === 0) {
    return new InlineKeyboard()
      .text('✅ Save Expense', 'exp:confirm')
      .text('✏️ Change', 'exp:change')
      .row()
      .text('❌ Cancel', 'exp:cancel');
  }

  const keyboard = new InlineKeyboard();

  // Row 1: Payer quick-switch & Split method
  const payerName = draft.payerName?.replace(/\s*\(You\)$/, '') || 'Payer';
  const splitLabel =
    draft.splitType === 'equal'
      ? 'Equal'
      : draft.splitType === 'shares'
      ? 'Shares'
      : draft.splitType === 'percentage'
      ? 'Percent'
      : 'Custom';

  keyboard
    .text(`👤 Paid by: ${payerName} ▾`, 'exp:form_cycle_payer')
    .text(`⚖️ ${splitLabel} ▾`, 'exp:ch_split')
    .row();

  // Participant toggle checkboxes directly on form
  const participantSet = new Set(draft.participantUserIds);
  const chunkSize = members.length <= 4 ? 2 : 3;

  for (let i = 0; i < members.length; i += chunkSize) {
    const chunk = members.slice(i, i + chunkSize);
    for (const member of chunk) {
      const isSelected = participantSet.has(member.userId);
      const prefix = isSelected ? '☑️' : '◻️';
      keyboard.text(`${prefix} ${member.name}`, `exp:form_toggle_part:${member.userId}`);
    }
    keyboard.row();
  }

  // Quick Action row
  if (members.length > 2) {
    keyboard.text('👥 Everyone', 'exp:form_part_all');
  }
  keyboard.text('✏️ Text', 'exp:ch_desc');
  keyboard.text('💰 Amount', 'exp:ch_amt');
  keyboard.row();

  // Bottom action row
  const amountStr = draft.totalAmount ? ` (${formatPaise(draft.totalAmount)})` : '';
  keyboard
    .text(`✅ Save Expense${amountStr}`, 'exp:confirm')
    .text('❌ Cancel', 'exp:cancel');

  return keyboard;
}

export function buildChangeMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📝 Description', 'exp:ch_desc')
    .text('💰 Amount', 'exp:ch_amt')
    .row()
    .text('👤 Payer', 'exp:ch_payer')
    .text('👥 Participants', 'exp:ch_part')
    .row()
    .text('⚖️ Split Method', 'exp:ch_split')
    .row()
    .text('⬅️ Back to Confirmation', 'exp:back_confirm');
}

export function buildPayerSelectionKeyboard(
  members: MemberOption[],
  selectedUserId?: string
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const member of members) {
    const isSelected = member.userId === selectedUserId;
    const prefix = isSelected ? '✅ ' : '👤 ';
    keyboard.text(`${prefix}${member.name}`, `exp:set_payer:${member.userId}`).row();
  }

  keyboard.text('⬅️ Back', 'exp:back_confirm').text('❌ Cancel', 'exp:cancel');
  return keyboard;
}

export function buildPayerListKeyboard(members: MemberOption[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const member of members) {
    keyboard.text(member.name, `exp:set_payer:${member.userId}`).row();
  }

  keyboard.text('⬅️ Back', 'exp:back_confirm').text('❌ Cancel', 'exp:cancel');
  return keyboard;
}

export function buildParticipantsSelectionKeyboard(
  members: MemberOption[],
  selectedUserIds: Set<string>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  // Toggle buttons for each member
  for (const member of members) {
    const isSelected = selectedUserIds.has(member.userId);
    const check = isSelected ? '☑️' : '◻️';
    keyboard.text(`${check} ${member.name}`, `exp:part_toggle:${member.userId}`).row();
  }

  // Quick select/clear buttons
  keyboard
    .text('Select All', 'exp:part_all')
    .text('Clear', 'exp:part_clear')
    .row();

  // Navigation
  keyboard
    .text('✅ Done', 'exp:part_done')
    .text('⬅️ Back', 'exp:back_confirm');

  return keyboard;
}

export function buildSplitTypeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('⚖️ Equal', 'split:equal')
    .text('💰 Custom Amount', 'split:custom')
    .row()
    .text('📊 Percentage', 'split:percentage')
    .text('🔢 Shares', 'split:shares')
    .row()
    .text('⬅️ Back', 'exp:back_confirm')
    .text('❌ Cancel', 'exp:cancel');
}

export function buildSharesKeyboard(
  members: MemberOption[],
  sharesMap: Record<string, number>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const member of members) {
    const shares = sharesMap[member.userId] ?? 1;
    keyboard.text(`👤 ${member.name}`, 'share:noop').row();
    keyboard
      .text('➖', `share:dec:${member.userId}`)
      .text(`${shares} ${shares === 1 ? 'share' : 'shares'}`, 'share:noop')
      .text('➕', `share:inc:${member.userId}`)
      .row();
  }

  keyboard.text('✅ Done', 'share:continue').text('❌ Cancel', 'exp:cancel');
  return keyboard;
}
