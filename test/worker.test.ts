import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { type WorkerEnvironment } from '../server/worker.ts';
import { healthResponseSchema } from '../shared/contracts.ts';

const RELEASE_SHA = '0123456789abcdef0123456789abcdef01234567';

function environment(): WorkerEnvironment {
  return {
    ASSETS: {
      async fetch() {
        return new Response('<!doctype html><title>Notes</title>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      },
    },
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'publishable-test-key',
    RELEASE_SHA,
  };
}

test('Cloudflare Worker serves the SPA and API from one secured release', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert.equal(init?.headers && new Headers(init.headers).get('apikey'), 'publishable-test-key');
    if (url === 'https://example.supabase.co/auth/v1/health') {
      return Response.json({ name: 'GoTrue' });
    }
    assert.equal(url, 'https://example.supabase.co/rest/v1/');
    assert.equal(init?.method, 'HEAD');
    return new Response(null, { status: 401 });
  };

  try {
    const env = environment();
    const root = await worker.fetch(new Request('https://notes.example.test/app/route'), env);
    assert.equal(root.status, 200);
    assert.match(await root.text(), /<title>Notes<\/title>/);
    assert.equal(root.headers.get('X-Release-Sha'), RELEASE_SHA);
    assert.match(root.headers.get('Content-Security-Policy') ?? '', /frame-ancestors 'none'/);
    assert.equal(root.headers.get('X-Content-Type-Options'), 'nosniff');

    const health = await worker.fetch(new Request('https://notes.example.test/api/health'), env);
    assert.equal(health.status, 200);
    assert.deepEqual(healthResponseSchema.parse(await health.json()), {
      status: 'ok',
      releaseSha: RELEASE_SHA,
      database: 'available',
    });

    const protectedRoute = await worker.fetch(new Request('https://notes.example.test/api/notes'), env);
    assert.equal(protectedRoute.status, 401);
    assert.equal(protectedRoute.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal((await protectedRoute.json()).error.code, 'UNAUTHENTICATED');

    const missingApiRoute = await worker.fetch(new Request('https://notes.example.test/api/missing'), env);
    assert.equal(missingApiRoute.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('production runtime configuration rejects missing bindings', async () => {
  const env = environment();
  env.RELEASE_SHA = '';
  await assert.rejects(
    () => worker.fetch(new Request('https://notes.example.test/'), env),
    /Too small|Invalid string|Invalid input/,
  );
});
