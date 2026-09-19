import { escapeMarkdown } from '../../shared/markdown';

export function formatMembersListMessage(
  groupTitle: string,
  members: Array<{ displayName?: string | null; username?: string | null }>
): string {
  const safeTitle = escapeMarkdown(groupTitle);
  if (members.length === 0) {
    return `👥 *${safeTitle} — Active Members*\n\n👥 No active members found.`;
  }

  const list = members
    .map((m, index) => {
      const name = escapeMarkdown(m.displayName || 'Unnamed Member');
      const handle = m.username ? ` (@${escapeMarkdown(m.username)})` : '';
      return `${index + 1}. ${name}${handle}`;
    })
    .join('\n');

  return `👥 *${safeTitle} — Active Members (${members.length})*\n\n${list}\n\n_New members are registered when they interact with BuddySplitter._`;
}
