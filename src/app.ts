import http from 'node:http';
import { Bot, Context } from 'grammy';
import { Env, getConfig } from './config';
import { createBot } from './bot';
import { initDbClient } from './db/client';
import { createRepositories } from './db/repositories';
import { createServices } from './modules/services';
import { logger } from './shared/logger';
import { createHttpServer } from './server';

export interface AppInstance {
  bot: Bot<Context>;
  server: http.Server;
  start: () => Promise<void>;
  stop: (signal?: string) => Promise<void>;
}

export function createApp(envConfig: Env = getConfig()): AppInstance {
  // Prefer SUPABASE_SERVICE_ROLE_KEY for server operations, falling back to SUPABASE_ANON_KEY
  const dbKey = envConfig.SUPABASE_SERVICE_ROLE_KEY || envConfig.SUPABASE_ANON_KEY;
  const dbClient = initDbClient(envConfig.SUPABASE_URL, dbKey);

  // Initialize repositories and domain services
  const repositories = createRepositories(dbClient);
  const services = createServices(repositories);

  // Initialize grammY bot with wired services
  const bot = createBot(envConfig.TELEGRAM_BOT_TOKEN, services);

  // Create production HTTP server for webhooks and health check
  const server = createHttpServer({
    bot,
    webhookSecret: envConfig.TELEGRAM_WEBHOOK_SECRET,
    webhookPath: envConfig.TELEGRAM_WEBHOOK_PATH,
  });

  let isRunning = false;

  const stop = async (signal?: string): Promise<void> => {
    if (!isRunning && !server.listening) return;
    logger.info(`Received ${signal ?? 'shutdown signal'}. Gracefully shutting down BuddySplitter...`);
    isRunning = false;

    // 1. Close HTTP server so new connections are rejected
    await new Promise<void>((resolve) => {
      if (server.listening) {
        server.close((err) => {
          if (err) {
            logger.error('Error closing HTTP server during shutdown:', err);
          }
          resolve();
        });
        if (typeof server.closeIdleConnections === 'function') {
          server.closeIdleConnections();
        }
      } else {
        resolve();
      }
    });

    // 2. Stop bot if running/initialized
    try {
      if (bot.isInited()) {
        await bot.stop();
      }
    } catch (err) {
      logger.error('Error stopping bot during shutdown:', err);
    }

    logger.info('BuddySplitter stopped cleanly.');
  };

  const start = async (): Promise<void> => {
    if (isRunning) return;
    isRunning = true;

    // Polling is strictly forbidden/disabled in production
    if (envConfig.NODE_ENV === 'production' && (envConfig as Record<string, unknown>).BOT_MODE === 'polling') {
      throw new Error('Long polling is disabled in production. Webhooks must be used.');
    }

    // Try pre-initializing bot info with Telegram API (fails gracefully if offline)
    try {
      if (!bot.isInited()) {
        await bot.init();
        logger.info(`BuddySplitter bot @${bot.botInfo.username} initialized.`);
      }
    } catch (err) {
      logger.warn('Could not pre-initialize bot with Telegram API (will initialize lazily on first update):', err);
    }

    const host = '0.0.0.0';
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : envConfig.PORT;

    await new Promise<void>((resolve, reject) => {
      server.listen(port, host, () => {
        logger.info(`BuddySplitter webhook server listening on http://${host}:${port}`);
        logger.info(`Health check available at http://${host}:${port}/health`);
        logger.info(`Webhook endpoint ready at http://${host}:${port}${envConfig.TELEGRAM_WEBHOOK_PATH}`);
        resolve();
      });
      server.once('error', reject);
    });

    const handleShutdown = async (sig: string): Promise<void> => {
      await stop(sig);
      process.exit(0);
    };

    process.once('SIGINT', () => void handleShutdown('SIGINT'));
    process.once('SIGTERM', () => void handleShutdown('SIGTERM'));
  };

  return { bot, server, start, stop };
}
