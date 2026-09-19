/**
 * In-memory sliding-window rate limiter for Telegram user actions.
 *
 * NOTE: This is a process-local rate limiter. It protects the bot process
 * against rapid repeated actions, accidental double-clicks, and spam bursts.
 * For distributed multi-instance production deployments, a Redis-backed
 * rate limiter should be used (planned for Phase 12).
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  /**
   * Checks whether an action keyed by `key` is permitted under `maxRequests` per `windowMs`.
   */
  check(key: string, maxRequests: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowMs;

    const timestamps = this.hits.get(key) || [];
    const validTimestamps = timestamps.filter((t) => t > windowStart);

    if (validTimestamps.length >= maxRequests) {
      const oldestInWindow = validTimestamps[0];
      const retryAfterMs = Math.max(0, oldestInWindow + windowMs - now);
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

      this.hits.set(key, validTimestamps);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, retryAfterSeconds),
      };
    }

    validTimestamps.push(now);
    this.hits.set(key, validTimestamps);

    return {
      allowed: true,
      remaining: maxRequests - validTimestamps.length,
      retryAfterSeconds: 0,
    };
  }

  /**
   * Resets rate limit records. If key is provided, resets only that key.
   */
  reset(key?: string): void {
    if (key) {
      this.hits.delete(key);
    } else {
      this.hits.clear();
    }
  }

  /**
   * Prunes expired timestamps to maintain bounded memory.
   */
  prune(maxAgeMs = 60000): void {
    const now = Date.now();
    const cutoff = now - maxAgeMs;

    for (const [key, timestamps] of this.hits.entries()) {
      const valid = timestamps.filter((t) => t > cutoff);
      if (valid.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, valid);
      }
    }
  }
}

export const rateLimiter = new RateLimiter();

/**
 * Standard policy limits:
 * - Query commands (/balance, /summary, /expenses, /members): 30 per 60s
 * - Mutation commands & callbacks (/add, payment confirm, delete, edit): 10 per 60s
 */
export const RATE_LIMIT_POLICIES = {
  QUERY: { maxRequests: 30, windowMs: 60 * 1000 },
  MUTATION: { maxRequests: 10, windowMs: 60 * 1000 },
};

export function checkUserRateLimit(
  userId: number,
  category: 'QUERY' | 'MUTATION'
): RateLimitResult {
  if (process.env.NODE_ENV === 'test' && !process.env.TEST_RATE_LIMIT) {
    return { allowed: true, remaining: 999, retryAfterSeconds: 0 };
  }
  const policy = RATE_LIMIT_POLICIES[category];
  const key = `${userId}:${category}`;
  return rateLimiter.check(key, policy.maxRequests, policy.windowMs);
}

export const RATE_LIMIT_EXCEEDED_MESSAGE =
  '⏳ *You’re doing that a bit too fast.*\n\nPlease wait a moment before trying again.';

