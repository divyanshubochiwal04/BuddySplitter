import { describe, it, expect } from 'vitest';
import { validateEnv } from './env';

describe('Environment Validation', () => {
  const validEnv = {
    TELEGRAM_BOT_TOKEN: '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ',
    SUPABASE_URL: 'https://xyzcompany.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key-12345',
    NODE_ENV: 'test',
  };

  it('validates a correct environment configuration', () => {
    const result = validateEnv(validEnv);
    expect(result.TELEGRAM_BOT_TOKEN).toBe(validEnv.TELEGRAM_BOT_TOKEN);
    expect(result.SUPABASE_URL).toBe(validEnv.SUPABASE_URL);
    expect(result.SUPABASE_ANON_KEY).toBe(validEnv.SUPABASE_ANON_KEY);
    expect(result.NODE_ENV).toBe('test');
  });

  it('accepts optional SUPABASE_SERVICE_ROLE_KEY', () => {
    const withServiceRole = {
      ...validEnv,
      SUPABASE_SERVICE_ROLE_KEY: 'secret-service-role-key',
    };
    const result = validateEnv(withServiceRole);
    expect(result.SUPABASE_SERVICE_ROLE_KEY).toBe('secret-service-role-key');
  });

  it('defaults NODE_ENV to development when not specified', () => {
    const { NODE_ENV, ...envWithoutNodeEnv } = validEnv;
    const result = validateEnv(envWithoutNodeEnv);
    expect(result.NODE_ENV).toBe('development');
  });

  it('fails when TELEGRAM_BOT_TOKEN is missing', () => {
    const invalid = { ...validEnv, TELEGRAM_BOT_TOKEN: '' };
    expect(() => validateEnv(invalid)).toThrow(/TELEGRAM_BOT_TOKEN/);
  });

  it('fails when SUPABASE_URL is invalid', () => {
    const invalid = { ...validEnv, SUPABASE_URL: 'not-a-valid-url' };
    expect(() => validateEnv(invalid)).toThrow(/SUPABASE_URL/);
  });

  it('fails when SUPABASE_ANON_KEY is missing', () => {
    const invalid = { ...validEnv, SUPABASE_ANON_KEY: '' };
    expect(() => validateEnv(invalid)).toThrow(/SUPABASE_ANON_KEY/);
  });

  it('defaults PORT to 3000 and TELEGRAM_WEBHOOK_PATH to /telegram/webhook', () => {
    const result = validateEnv(validEnv);
    expect(result.PORT).toBe(3000);
    expect(result.TELEGRAM_WEBHOOK_PATH).toBe('/telegram/webhook');
    expect(result.TELEGRAM_WEBHOOK_SECRET).toBeUndefined();
  });

  it('accepts custom PORT and parses string to integer', () => {
    const withCustomPort = { ...validEnv, PORT: '8080' };
    const result = validateEnv(withCustomPort);
    expect(result.PORT).toBe(8080);
  });

  it('accepts optional TELEGRAM_WEBHOOK_SECRET', () => {
    const withSecret = { ...validEnv, TELEGRAM_WEBHOOK_SECRET: 'my-super-secret-token' };
    const result = validateEnv(withSecret);
    expect(result.TELEGRAM_WEBHOOK_SECRET).toBe('my-super-secret-token');
  });

  it('fails when TELEGRAM_WEBHOOK_SECRET is empty string', () => {
    const invalidSecret = { ...validEnv, TELEGRAM_WEBHOOK_SECRET: '' };
    expect(() => validateEnv(invalidSecret)).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
  });

  it('fails when TELEGRAM_WEBHOOK_SECRET is omitted in production mode', () => {
    const prodEnvWithoutSecret = { ...validEnv, NODE_ENV: 'production' };
    expect(() => validateEnv(prodEnvWithoutSecret)).toThrow(/TELEGRAM_WEBHOOK_SECRET is required in production mode/);
  });

  it('succeeds when TELEGRAM_WEBHOOK_SECRET is provided in production mode', () => {
    const prodEnvWithSecret = {
      ...validEnv,
      NODE_ENV: 'production',
      TELEGRAM_WEBHOOK_SECRET: 'prod-secret-token-12345',
    };
    const result = validateEnv(prodEnvWithSecret);
    expect(result.NODE_ENV).toBe('production');
    expect(result.TELEGRAM_WEBHOOK_SECRET).toBe('prod-secret-token-12345');
  });

  it('allows TELEGRAM_WEBHOOK_SECRET to be omitted in development mode', () => {
    const devEnv = { ...validEnv, NODE_ENV: 'development' };
    const result = validateEnv(devEnv);
    expect(result.NODE_ENV).toBe('development');
    expect(result.TELEGRAM_WEBHOOK_SECRET).toBeUndefined();
  });
});
