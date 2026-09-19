import { Env, validateEnv } from './env';

let cachedConfig: Env | null = null;

export function getConfig(): Env {
  if (!cachedConfig) {
    cachedConfig = validateEnv();
  }
  return cachedConfig;
}

export { Env, validateEnv };
