/**
 * Escapes characters that have special syntactic meaning in Telegram Markdown (v1).
 * The special formatting characters in Markdown v1 are *, _, `, and [.
 */
export function escapeMarkdown(text: string | null | undefined): string {
  if (!text) return '';
  return String(text).replace(/([*_`\[\]])/g, '\\$1');
}

/**
 * Safely truncates a string to maxLength, appending an ellipsis if truncated.
 */
export function truncateText(text: string | null | undefined, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}
