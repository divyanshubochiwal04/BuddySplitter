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

export interface MarkdownValidationResult {
  isValid: boolean;
  error?: string;
  errorOffset?: number;
  charIndex?: number;
}

/**
 * Validates a string against Telegram legacy Markdown (v1) parsing rules.
 * Reports UTF-8 byte offset for any unclosed entities, matching Telegram API error offsets.
 */
export function validateTelegramMarkdown(text: string | null | undefined): MarkdownValidationResult {
  if (!text) return { isValid: true };

  let i = 0;
  let inCodeBlock = false;
  let inInlineCode = false;
  let codeBlockStartOffset = 0;
  let codeBlockCharIndex = 0;
  let inlineCodeStartOffset = 0;
  let inlineCodeCharIndex = 0;

  const stack: Array<{ type: '*' | '_' | '['; charIndex: number; byteOffset: number }> = [];

  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }

    if (inCodeBlock) {
      if (text.slice(i, i + 3) === '```') {
        inCodeBlock = false;
        i += 3;
      } else {
        i++;
      }
      continue;
    }

    if (inInlineCode) {
      if (text[i] === '`') {
        inInlineCode = false;
        i++;
      } else {
        i++;
      }
      continue;
    }

    if (text.slice(i, i + 3) === '```') {
      inCodeBlock = true;
      codeBlockStartOffset = Buffer.byteLength(text.slice(0, i), 'utf-8');
      codeBlockCharIndex = i;
      i += 3;
    } else if (text[i] === '`') {
      inInlineCode = true;
      inlineCodeStartOffset = Buffer.byteLength(text.slice(0, i), 'utf-8');
      inlineCodeCharIndex = i;
      i++;
    } else if (text[i] === '*') {
      const byteOffset = Buffer.byteLength(text.slice(0, i), 'utf-8');
      const last = stack[stack.length - 1];
      if (last && last.type === '*') {
        stack.pop();
      } else {
        stack.push({ type: '*', charIndex: i, byteOffset });
      }
      i++;
    } else if (text[i] === '_') {
      const byteOffset = Buffer.byteLength(text.slice(0, i), 'utf-8');
      const last = stack[stack.length - 1];
      if (last && last.type === '_') {
        stack.pop();
      } else {
        stack.push({ type: '_', charIndex: i, byteOffset });
      }
      i++;
    } else if (text[i] === '[') {
      const byteOffset = Buffer.byteLength(text.slice(0, i), 'utf-8');
      stack.push({ type: '[', charIndex: i, byteOffset });
      i++;
    } else if (text[i] === ']') {
      const last = stack[stack.length - 1];
      if (last && last.type === '[' && text[i + 1] === '(') {
        const closeParen = text.indexOf(')', i + 2);
        if (closeParen !== -1) {
          stack.pop();
          i = closeParen + 1;
          continue;
        }
      }
      i++;
    } else {
      i++;
    }
  }

  if (inCodeBlock) {
    return {
      isValid: false,
      error: `Can't find end of code block starting at byte offset ${codeBlockStartOffset}`,
      errorOffset: codeBlockStartOffset,
      charIndex: codeBlockCharIndex,
    };
  }

  if (inInlineCode) {
    return {
      isValid: false,
      error: `Can't find end of inline code starting at byte offset ${inlineCodeStartOffset}`,
      errorOffset: inlineCodeStartOffset,
      charIndex: inlineCodeCharIndex,
    };
  }

  if (stack.length > 0) {
    const top = stack[stack.length - 1];
    return {
      isValid: false,
      error: `Can't find end of the entity starting at byte offset ${top.byteOffset}`,
      errorOffset: top.byteOffset,
      charIndex: top.charIndex,
    };
  }

  return { isValid: true };
}

/**
 * Sanitizes a message for Telegram legacy Markdown by escaping any unclosed entities,
 * while leaving valid formatting intact.
 */
export function sanitizeTelegramMarkdown(text: string | null | undefined): string {
  if (!text) return '';
  let result = String(text);
  let iterations = 0;
  while (iterations < 20) {
    const check = validateTelegramMarkdown(result);
    if (check.isValid) break;
    const idx = check.charIndex;
    if (idx !== undefined && idx >= 0 && idx < result.length) {
      result = result.slice(0, idx) + '\\' + result.slice(idx);
    } else {
      break;
    }
    iterations++;
  }
  return result;
}
