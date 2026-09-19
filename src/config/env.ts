import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().nonnegative().default(3000),
    TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
    TELEGRAM_WEBHOOK_SECRET: z.string().min(1, 'TELEGRAM_WEBHOOK_SECRET cannot be empty if provided').optional(),
    TELEGRAM_WEBHOOK_PATH: z.string().default('/telegram/webhook'),
    SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
    SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY cannot be empty if provided').optional(),
    PRIVACY_POLICY_URL: z.string().url('PRIVACY_POLICY_URL must be a valid URL').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production' && !data.TELEGRAM_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['TELEGRAM_WEBHOOK_SECRET'],
        message: 'TELEGRAM_WEBHOOK_SECRET is required in production mode',
      });
    }
  });


export type Env = z.infer<typeof envSchema>;

export function validateEnv(rawEnv: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${errorDetails}`);
  }

  return result.data;
}
