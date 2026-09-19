import { Bot, Context } from 'grammy';
import { Env, getConfig } from './config';
import { createBot } from './bot';
import { initDbClient } from './db/client';
import { createRepositories } from './db/repositories';
import { createServices } from './modules/services';
import { logger } from './shared/logger';

export interface AppInstance {
  bot: Bot<Context>;
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

  let isRunning = false;

  const stop = async (signal?: string): Promise<void> => {
    if (!isRunning) return;
    logger.info(`Received ${signal ?? 'shutdown signal'}. Gracefully shutting down BuddySplitter...`);
    isRunning = false;
    await bot.stop();
    logger.info('BuddySplitter stopped cleanly.');
  };

  const start = async (): Promise<void> => {
    isRunning = true;

    const handleShutdown = async (sig: string): Promise<void> => {
      await stop(sig);
      process.exit(0);
    };

    process.once('SIGINT', () => void handleShutdown('SIGINT'));
    process.once('SIGTERM', () => void handleShutdown('SIGTERM'));

    logger.info('Starting BuddySplitter bot...');
    await bot.start({
      onStart: (botInfo) => {
        logger.info(`BuddySplitter bot @${botInfo.username} is running!`);
      },
    });
  };

  return { bot, start, stop };
}
