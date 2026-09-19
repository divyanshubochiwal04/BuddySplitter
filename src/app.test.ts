import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApp, AppInstance } from './app';
import { Env } from './config';

describe('App Lifecycle & Webhook Startup/Shutdown', () => {
  let app: AppInstance | null = null;

  const testEnv: Env = {
    NODE_ENV: 'test',
    PORT: 0, // OS chooses available port
    TELEGRAM_BOT_TOKEN: '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ',
    TELEGRAM_WEBHOOK_SECRET: 'test-lifecycle-secret',
    TELEGRAM_WEBHOOK_PATH: '/telegram/webhook',
    SUPABASE_URL: 'https://test-supabase.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  };

  afterEach(async () => {
    if (app) {
      await app.stop();
      app = null;
    }
  });

  it('initializes AppInstance with bot, server, start, and stop methods', () => {
    app = createApp(testEnv);
    expect(app.bot).toBeDefined();
    expect(app.server).toBeDefined();
    expect(typeof app.start).toBe('function');
    expect(typeof app.stop).toBe('function');
  });

  it('starts the webhook HTTP server and responds to /health', async () => {
    app = createApp(testEnv);

    // Mock bot.init so it doesn't make real network calls in test
    vi.spyOn(app.bot, 'init').mockResolvedValue();
    vi.spyOn(app.bot, 'isInited').mockReturnValue(true);

    await app.start();
    expect(app.server.listening).toBe(true);

    const addr = app.server.address();
    expect(addr).toBeDefined();
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0;

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ status: 'ok' });
  });

  it('gracefully shuts down the HTTP server and stops the bot', async () => {
    app = createApp(testEnv);

    vi.spyOn(app.bot, 'init').mockResolvedValue();
    vi.spyOn(app.bot, 'isInited').mockReturnValue(true);
    const botStopSpy = vi.spyOn(app.bot, 'stop').mockResolvedValue();

    await app.start();
    expect(app.server.listening).toBe(true);

    await app.stop('SIGTERM');

    expect(app.server.listening).toBe(false);
    expect(botStopSpy).toHaveBeenCalled();
  });

  it('handles repeated stop calls cleanly without errors (idempotent)', async () => {
    app = createApp(testEnv);

    vi.spyOn(app.bot, 'init').mockResolvedValue();
    vi.spyOn(app.bot, 'isInited').mockReturnValue(true);

    await app.start();
    await app.stop('SIGINT');
    // Second stop should be a no-op and not throw
    await expect(app.stop('SIGINT')).resolves.toBeUndefined();
  });

  it('disallows long polling mode in production', async () => {
    const prodEnvWithPolling: Env = {
      ...testEnv,
      NODE_ENV: 'production',
    };
    (prodEnvWithPolling as Record<string, unknown>).BOT_MODE = 'polling';

    const prodApp = createApp(prodEnvWithPolling);
    await expect(prodApp.start()).rejects.toThrow(/Long polling is disabled in production/);
  });
});
