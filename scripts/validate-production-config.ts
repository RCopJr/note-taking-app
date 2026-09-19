import { parseRuntimeConfig } from '../server/runtime.ts';

const config = parseRuntimeConfig({
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  RELEASE_SHA: process.env.RELEASE_SHA,
  ESV_API_KEY: process.env.ESV_API_KEY || undefined,
});

if (new URL(config.supabase.url).protocol !== 'https:') {
  throw new Error('Production Supabase must use HTTPS.');
}
if (process.env.VITE_SUPABASE_URL !== config.supabase.url) {
  throw new Error('Browser and server Supabase URLs must match.');
}
if (process.env.VITE_SUPABASE_ANON_KEY !== config.supabase.publishableKey) {
  throw new Error('Browser and server Supabase publishable keys must match.');
}

console.log(`Production configuration is valid for release ${config.releaseSha}.`);
