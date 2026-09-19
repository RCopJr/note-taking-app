import { z } from 'zod/v4';
import {
  serverSupabaseConfigSchema,
  type ServerSupabaseConfig,
} from './supabase.ts';

const releaseShaSchema = z.union([
  z.literal('development'),
  z.string().regex(/^[0-9a-f]{7,64}$/i),
]);

const runtimeEnvironmentSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().trim().min(1),
  RELEASE_SHA: releaseShaSchema,
  ESV_API_KEY: z.string().trim().min(1).optional(),
});

export interface RuntimeConfig {
  supabase: ServerSupabaseConfig;
  releaseSha: string;
  esvApiKey?: string;
}

export function parseRuntimeConfig(environment: Record<string, string | undefined>): RuntimeConfig {
  const parsed = runtimeEnvironmentSchema.parse(environment);
  return {
    supabase: serverSupabaseConfigSchema.parse({
      url: parsed.SUPABASE_URL,
      publishableKey: parsed.SUPABASE_ANON_KEY,
    }),
    releaseSha: parsed.RELEASE_SHA,
    ...(parsed.ESV_API_KEY ? { esvApiKey: parsed.ESV_API_KEY } : {}),
  };
}

export async function checkSupabaseConnection(config: ServerSupabaseConfig): Promise<boolean> {
  try {
    const headers = { apikey: config.publishableKey };
    const [auth, rest] = await Promise.all([
      fetch(`${config.url}/auth/v1/health`, {
        headers,
        signal: AbortSignal.timeout(5_000),
      }),
      fetch(`${config.url}/rest/v1/`, {
        method: 'HEAD',
        headers,
        signal: AbortSignal.timeout(5_000),
      }),
    ]);
    await Promise.all([auth.body?.cancel(), rest.body?.cancel()]);
    return auth.ok && rest.status < 500;
  } catch {
    return false;
  }
}
