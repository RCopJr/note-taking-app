import { serve } from '@hono/node-server';
import { createApp } from './index.ts';
import { parseRuntimeConfig } from './runtime.ts';

function parsePort(args: string[]): number {
  const index = args.indexOf('--port');
  if (index < 0) return 3001;
  const port = Number.parseInt(args[index + 1] ?? '', 10);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : 3001;
}

const port = parsePort(process.argv.slice(2));
const runtimeConfig = parseRuntimeConfig({
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  RELEASE_SHA: process.env.RELEASE_SHA ?? 'development',
  ESV_API_KEY: process.env.ESV_API_KEY || undefined,
});
const app = createApp({
  runtimeConfig,
  allowedOrigins: ['http://127.0.0.1:5173', 'http://localhost:5173'],
});

console.log(`[Notes] Server running on http://127.0.0.1:${port}`);
serve({
  fetch: app.fetch,
  port,
  hostname: '127.0.0.1',
});
