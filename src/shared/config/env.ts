import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  /** Public API base URL for Swagger “Server” (e.g. https://api.example.com). Optional. */
  PUBLIC_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v.replace(/\/$/, '') : undefined)),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /** Seedr email/password/tokens come from Supabase `seedr_db` (id=1). */
  SEEDR_BASE_URL: z.string().url().default('https://www.seedr.cc'),
  TMDB_API_KEY: z.string().min(1),
  TMDB_BASE_URL: z.string().url().default('https://api.themoviedb.org/3'),
  REDIS_URL: z
    .string()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
  /** Live 5movierulz mirror — poster / image hosts are rewritten to this origin. */
  MOVIES_RULSZ: z
    .string()
    .url()
    .default('https://www.5movierulz.vote/')
    .transform((v) => (v.endsWith('/') ? v : `${v}/`)),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const merged = {
    ...raw,
    REDIS_URL: raw.REDIS_URL || raw.redis_url || '',
  };
  const parsed = envSchema.safeParse(merged);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${details}`);
  }
  return parsed.data;
}
