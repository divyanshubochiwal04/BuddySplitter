import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter, checkUserRateLimit } from './rate-limiter';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
    limiter.reset();
  });

  it('allows requests within limit', () => {
    const res1 = limiter.check('user1', 3, 10000);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(2);

    const res2 = limiter.check('user1', 3, 10000);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = limiter.check('user1', 3, 10000);
    expect(res3.allowed).toBe(true);
    expect(res3.remaining).toBe(0);
  });

  it('blocks requests exceeding limit', () => {
    for (let i = 0; i < 3; i++) {
      limiter.check('user1', 3, 10000);
    }

    const blocked = limiter.check('user1', 3, 10000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('isolates different users', () => {
    for (let i = 0; i < 3; i++) {
      limiter.check('user1', 3, 10000);
    }

    expect(limiter.check('user1', 3, 10000).allowed).toBe(false);
    expect(limiter.check('user2', 3, 10000).allowed).toBe(true);
  });

  it('resets a specific key', () => {
    for (let i = 0; i < 3; i++) {
      limiter.check('user1', 3, 10000);
    }
    expect(limiter.check('user1', 3, 10000).allowed).toBe(false);

    limiter.reset('user1');
    expect(limiter.check('user1', 3, 10000).allowed).toBe(true);
  });

  it('prunes expired entries', () => {
    vi.useFakeTimers();
    try {
      limiter.check('user1', 5, 1000);
      vi.advanceTimersByTime(2000);
      limiter.prune(1000);

      // After pruning, user1 should have fresh capacity
      const res = limiter.check('user1', 5, 1000);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('checkUserRateLimit applies standard policies', () => {
    const res = checkUserRateLimit(12345, 'QUERY');
    expect(res.allowed).toBe(true);
  });
});
