import { createApp } from './index.ts';
import { parseRuntimeConfig, type RuntimeConfig } from './runtime.ts';

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

export interface WorkerEnvironment {
  ASSETS: AssetBinding;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  RELEASE_SHA: string;
  ESV_API_KEY?: string;
}

interface Deployment {
  app: ReturnType<typeof createApp>;
  config: RuntimeConfig;
}

const deploymentCache = new WeakMap<object, Deployment>();

function deploymentFor(environment: WorkerEnvironment): Deployment {
  const cached = deploymentCache.get(environment);
  if (cached) return cached;
  const config = parseRuntimeConfig({
    SUPABASE_URL: environment.SUPABASE_URL,
    SUPABASE_ANON_KEY: environment.SUPABASE_ANON_KEY,
    RELEASE_SHA: environment.RELEASE_SHA,
    ESV_API_KEY: environment.ESV_API_KEY,
  });
  const deployment = {
    app: createApp({ runtimeConfig: config }),
    config,
  };
  deploymentCache.set(environment, deployment);
  return deployment;
}

function withSecurityHeaders(response: Response, releaseSha: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Release-Sha', releaseSha);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, environment: WorkerEnvironment): Promise<Response> {
    const deployment = deploymentFor(environment);
    const pathname = new URL(request.url).pathname;
    const response = pathname === '/api' || pathname.startsWith('/api/')
      ? await deployment.app.fetch(request)
      : await environment.ASSETS.fetch(request);
    return withSecurityHeaders(response, deployment.config.releaseSha);
  },
};
