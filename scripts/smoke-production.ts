import assert from 'node:assert/strict';
import { healthResponseSchema } from '../shared/contracts.ts';

const [baseUrlInput, expectedSha] = process.argv.slice(2);
assert.ok(baseUrlInput, 'Usage: smoke-production.ts <base-url> <expected-sha>');
assert.match(expectedSha ?? '', /^[0-9a-f]{40}$/i, 'Expected release SHA must be a full Git SHA.');

const baseUrl = new URL(baseUrlInput);
assert.equal(baseUrl.protocol, 'https:', 'Production smoke checks require HTTPS.');

async function requireOk(pathname: string): Promise<Response> {
  const response = await fetch(new URL(pathname, baseUrl), {
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 200, `${pathname} returned HTTP ${response.status}.`);
  return response;
}

const root = await requireOk('/');
assert.match(root.headers.get('Content-Type') ?? '', /^text\/html\b/i);
assert.equal(root.headers.get('X-Release-Sha'), expectedSha);
assert.equal(root.headers.get('X-Content-Type-Options'), 'nosniff');
assert.equal(root.headers.get('X-Frame-Options'), 'DENY');
assert.ok(root.headers.has('Content-Security-Policy'));
assert.ok(root.headers.has('Permissions-Policy'));
assert.ok(root.headers.has('Referrer-Policy'));

const html = await root.text();
const assetPaths = [...html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)="([^"]+)"/gi)]
  .map((match) => match[1])
  .filter((path) => path.startsWith('/assets/'));
assert.ok(assetPaths.length > 0, 'Application HTML did not reference a built asset.');
for (const assetPath of new Set(assetPaths)) await requireOk(assetPath);

const health = await requireOk('/api/health');
assert.deepEqual(healthResponseSchema.parse(await health.json()), {
  status: 'ok',
  releaseSha: expectedSha,
  database: 'available',
});

const protectedResponse = await fetch(new URL('/api/notes', baseUrl), {
  headers: { Origin: 'https://untrusted.example' },
  signal: AbortSignal.timeout(15_000),
});
assert.equal(protectedResponse.status, 401);
assert.equal(protectedResponse.headers.get('Access-Control-Allow-Origin'), null);
assert.equal((await protectedResponse.json()).error.code, 'UNAUTHENTICATED');

console.log(`Production smoke passed for ${baseUrl.origin} at ${expectedSha}.`);
