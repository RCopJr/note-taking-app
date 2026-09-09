import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ApiClientError,
  fetchNote,
} from '../src/api.ts';

test('API client preserves stable server error codes', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested note was not found.',
    },
  }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });

  await assert.rejects(
    fetchNote('missing.md'),
    (error: unknown) => error instanceof ApiClientError
      && error.status === 404
      && error.code === 'NOT_FOUND'
      && error.message === 'The requested note was not found.',
  );
});

test('API client rejects successful responses that violate the contract', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: 'note.md',
    content: '# Note',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  await assert.rejects(
    fetchNote('note.md'),
    (error: unknown) => error instanceof ApiClientError
      && error.code === 'INVALID_RESPONSE',
  );
});
