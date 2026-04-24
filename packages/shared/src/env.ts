import { z } from 'zod';

/**
 * Backend (xfs-server) environment schema. Validated at boot; process exits
 * on failure so misconfiguration never slips into a running service.
 */
export const xfsServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((s) => s.startsWith('postgres://') || s.startsWith('postgresql://'), {
      message: 'DATABASE_URL must be a postgres:// or postgresql:// URL',
    }),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  XFS_SERVER_PORT: z.coerce.number().int().positive().default(3001),
  XFS_SERVER_HOST: z.string().default('0.0.0.0'),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_PRETTY: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true')
    .default('false'),
  LOG_FILE: z.string().optional(),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  ATM_BANK_NAME: z.string().default('Bank Zegen'),
  ATM_TERMINAL_ID: z.string().default('ZGN-001'),
});

export type XfsServerEnv = z.infer<typeof xfsServerEnvSchema>;

/**
 * Parse and validate environment variables for the xfs-server.
 * On validation failure, logs the formatted error to stderr and exits(1).
 */
export function loadXfsServerEnv(source: NodeJS.ProcessEnv = process.env): XfsServerEnv {
  const parsed = xfsServerEnvSchema.safeParse(source);
  if (!parsed.success) {
    const formatted = parsed.error.format();
    process.stderr.write(
      `[env] Invalid environment configuration:\n${JSON.stringify(formatted, null, 2)}\n`,
    );
    process.exit(1);
  }
  return parsed.data;
}

/** Parse CORS_ORIGINS into a typed list of origins. */
export function parseCorsOrigins(env: XfsServerEnv): string[] {
  return env.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
