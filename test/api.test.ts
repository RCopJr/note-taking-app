import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ApiClientError,
  configureAccessTokenProvider,
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

test('API client authenticates protected requests', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    configureAccessTokenProvider(null);
  });
  configureAccessTokenProvider(async () => 'access-token');
  globalThis.fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer access-token');
    return new Response(JSON.stringify({
      id: 'note.md',
      path: 'note.md',
      title: 'Note',
      tags: [],
      size: 6,
      updatedAt: 1,
      content: '# Note',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  assert.equal((await fetchNote('note.md')).content, '# Note');
});
