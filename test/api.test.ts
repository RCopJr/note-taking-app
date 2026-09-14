import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ApiClientError,
  configureAccessTokenProvider,
  fetchNote,
  saveNoteContent,
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
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      path: 'note.md',
      name: 'note.md',
      folderId: null,
      title: 'Note',
      tags: [],
      size: 6,
      revision: 1,
      updatedAt: 1,
      content: '# Note',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  assert.equal((await fetchNote('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1')).content, '# Note');
});

test('API client sends the loaded revision with an explicit save', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    configureAccessTokenProvider(null);
  });
  configureAccessTokenProvider(async () => 'access-token');
  globalThis.fetch = async (_input, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), {
      content: '# Revised',
      expectedRevision: 7,
    });
    return new Response(JSON.stringify({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      path: 'note.md',
      name: 'note.md',
      folderId: null,
      title: 'Revised',
      tags: [],
      size: 9,
      revision: 8,
      updatedAt: 2,
      content: '# Revised',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  assert.equal(
    (await saveNoteContent('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '# Revised', 7)).revision,
    8,
  );
});
