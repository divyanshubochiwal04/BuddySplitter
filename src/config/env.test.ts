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
});
