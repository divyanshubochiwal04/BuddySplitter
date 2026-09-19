export function formatMembersListMessage(
  groupTitle: string,
  members: Array<{ displayName?: string | null; username?: string | null }>
): string {
  if (members.length === 0) {
    return `👥 *${groupTitle} — Members*\n\nNo registered members yet. Members are registered automatically as they interact with the bot!`;
  }

  const list = members
    .map((m, index) => {
      const name = m.displayName || 'Unnamed Member';
      const handle = m.username ? ` (@${m.username})` : '';
      return `${index + 1}. ${name}${handle}`;
    })
    .join('\n');

  return `👥 *${groupTitle} — Active Members (${members.length})*\n\n${list}\n\n_New members are registered when they interact with BuddySplitter._`;
}
