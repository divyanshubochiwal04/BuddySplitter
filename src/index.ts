import { getConfig } from './config';
import { createApp } from './app';
import { logger } from './shared/logger';

async function main(): Promise<void> {
  try {
    const config = getConfig();
    const app = createApp(config);
    await app.start();
  } catch (error) {
    logger.error('Fatal error during startup:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}

export { main };
