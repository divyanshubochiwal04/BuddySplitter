import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { Bot, Context } from 'grammy';
import { createHttpServer, timingSafeCompare } from './http-server';

describe('HTTP Server & Webhook Architecture', () => {
  let server: http.Server | null = null;
  let port: number = 0;
  let bot: Bot<Context>;

  const DUMMY_SECRET = 'test-webhook-secret-token-12345';

  const createTestBot = () => {
    return new Bot<Context>('123456789:ABCdefGHIjklMNOpqrSTUvwxYZ', {
      botInfo: {
        id: 123456789,
        is_bot: true,
        first_name: 'BuddySplitterBot',
        username: 'BuddySplitterBot',
        can_join_groups: true,
        can_read_all_group_messages: true,
        supports_inline_queries: false,
        can_connect_to_business: false,
        has_main_web_app: false,
      } as any,
    });
  };

  const startServer = async (testServer: http.Server): Promise<number> => {
    return new Promise((resolve) => {
      testServer.listen(0, '127.0.0.1', () => {
        const addr = testServer.address();
        if (typeof addr === 'object' && addr !== null) {
          resolve(addr.port);
        } else {
          resolve(0);
        }
      });
    });
  };

  afterEach(async () => {
    if (server && server.listening) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
    }
    server = null;
  });

  describe('timingSafeCompare', () => {
    it('returns true for matching secrets', () => {
      expect(timingSafeCompare('my-secret-token', 'my-secret-token')).toBe(true);
    });

    it('returns true when header is string array with matching token', () => {
      expect(timingSafeCompare(['my-secret-token'], 'my-secret-token')).toBe(true);
    });

    it('returns false for secrets of different lengths', () => {
      expect(timingSafeCompare('short', 'longer-secret')).toBe(false);
    });

    it('returns false for secrets of same length with different characters', () => {
      expect(timingSafeCompare('secret-a', 'secret-b')).toBe(false);
    });

    it('returns false when incoming header is undefined or empty', () => {
      expect(timingSafeCompare(undefined, 'secret')).toBe(false);
      expect(timingSafeCompare('', 'secret')).toBe(false);
    });

    it('returns false when expected token is undefined or empty', () => {
      expect(timingSafeCompare('secret', undefined)).toBe(false);
      expect(timingSafeCompare('secret', '')).toBe(false);
    });
  });

  describe('GET /health endpoint', () => {
    it('responds with HTTP 200 and {"status":"ok"}', async () => {
      bot = createTestBot();
      server = createHttpServer({ bot });
      port = await startServer(server);

      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');

      const data = await response.json();
      expect(data).toEqual({ status: 'ok' });
    });

    it('returns HTTP 405 Method Not Allowed for non-GET methods on /health', async () => {
      bot = createTestBot();
      server = createHttpServer({ bot });
      port = await startServer(server);

      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        method: 'POST',
      });
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET');

      const data = await response.json();
      expect(data).toEqual({ error: 'Method Not Allowed' });
    });
  });

  describe('Telegram Webhook - Secret Token Validation', () => {
    it('rejects requests with missing secret token when secret is configured (401)', async () => {
      bot = createTestBot();
      server = createHttpServer({ bot, webhookSecret: DUMMY_SECRET });
      port = await startServer(server);

      const response = await fetch(`http://127.0.0.1:${port}/telegram/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update_id: 100 }),
      });

      expect(response.status).toBe(401);
      const data = (await response.json()) as { error?: string };
      expect(data.error).toContain('Unauthorized');
    });

    it('rejects requests with invalid secret token when secret is configured (401)', async () => {
      bot = createTestBot();
      server = createHttpServer({ bot, webhookSecret: DUMMY_SECRET });
      port = await startServer(server);

      const response = await fetch(`http://127.0.0.1:${port}/telegram/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'wrong-secret-token',
        },
        body: JSON.stringify({ update_id: 100 }),
      });

      expect(response.status).toBe(401);
      const data = (await response.json()) as { error?: string };
      expect(data.error).toContain('Unauthorized');
    });
  });

  describe('Telegram Webhook - Valid Request Handling', () => {
    it('accepts and processes valid update payload with matching secret token (200)', async () => {
      bot = createTestBot();
      let handledUpdateId = 0;
      bot.on('message', (ctx) => {
        handledUpdateId = ctx.update.update_id;
      });

      server = createHttpServer({ bot, webhookSecret: DUMMY_SECRET });
      port = await startServer(server);

      const validUpdate = {
        update_id: 777888,
        message: {
          message_id: 10,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 12345, type: 'private' },
          from: { id: 12345, is_bot: false, first_name: 'TestUser' },
          text: 'Hello BuddySplitter',
        },
      };

      const response = await fetch(`http://127.0.0.1:${port}/telegram/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': DUMMY_SECRET,
        },
        body: JSON.stringify(validUpdate),
      });

      expect(response.status).toBe(200);
      expect(handledUpdateId).toBe(777888);
    });

    it('processes valid update when no webhookSecret is configured (local dev mode)', async () => {
      bot = createTestBot();
      let handledText = '';
      bot.on('message:text', (ctx) => {
        handledText = ctx.message.text;
      });

      server = createHttpServer({ bot });
      port = await startServer(server);

      const validUpdate = {
        update_id: 999111,
        message: {
          message_id: 11,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 12345, type: 'private' },
          from: { id: 12345, is_bot: false, first_name: 'DevUser' },
          text: 'Local dev test',
        },
      };

      const response = await fetch(`http://127.0.0.1:${port}/telegram/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validUpdate),
      });

      expect(response.status).toBe(200);
      expect(handledText).toBe('Local dev test');
    });
  });

  describe('Telegram Webhook - Malformed Request Handling', () => {
    it('returns HTTP 400 Bad Request when request body is not valid JSON', async () => {
      bot = createTestBot();
      server = createHttpServer({ bot, webhookSecret: DUMMY_SECRET });
      port = await startServer(server);

      const response = await fetch(`http://127.0.0.1:${port}/telegram/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': DUMMY_SECRET,
        },
        body: 'NOT_A_VALID_JSON_STRING_{{broken',
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as { error?: string };
      expect(data.error).toContain('Malformed request');
    });
  });

  describe('Routing & HTTP Methods', () => {
    it('returns HTTP 404 for unknown endpoints', async () => {
      bot = createTestBot();
      server = createHttpServer({ bot });
      port = await startServer(server);

      const response = await fetch(`http://127.0.0.1:${port}/api/unknown`);
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: 'Not Found' });
    });

    it('returns HTTP 405 Method Not Allowed when GET is sent to webhook endpoint', async () => {
      bot = createTestBot();
      server = createHttpServer({ bot });
      port = await startServer(server);

      const response = await fetch(`http://127.0.0.1:${port}/telegram/webhook`, {
        method: 'GET',
      });
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
      const data = await response.json();
      expect(data).toEqual({ error: 'Method Not Allowed' });
    });
  });
});
