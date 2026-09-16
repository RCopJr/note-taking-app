import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../server/index.ts';
import type { CloudNoteStore } from '../server/cloud-notes.ts';
import type { DataTransferStore } from '../server/data-transfer.ts';
import { ApiError } from '../server/http.ts';
import type { NoteDocument } from '../shared/contracts.ts';

const ALICE_ID = '11111111-1111-4111-8111-111111111111';
const BOB_ID = '22222222-2222-4222-8222-222222222222';
const NOTE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

let note: NoteDocument = {
  id: NOTE_ID,
  path: 'welcome.md',
  name: 'welcome.md',
  folderId: null,
  title: 'Welcome',
  tags: ['guide'],
  size: 9,
  revision: 1,
  updatedAt: 1,
  content: '# Welcome',
};

const noteStore: CloudNoteStore = {
  async listNotes(context) {
    if (context.userId !== ALICE_ID) return [];
    const { content: _, ...metadata } = note;
    return [metadata];
  },
  async listTree(context) {
    return context.userId === ALICE_ID
      ? [{ name: note.name, id: note.id, parentId: note.folderId, type: 'file', size: note.size, revision: note.revision, updatedAt: note.updatedAt }]
      : [];
  },
  async listDeleted(context) {
    return context.userId === ALICE_ID
      ? [{ id: note.id, name: note.name, type: 'file', revision: note.revision, deletedAt: 1 }]
      : [];
  },
  async getNote(context, id) {
    if (context.userId !== ALICE_ID || id !== NOTE_ID) {
      throw new ApiError(404, 'NOT_FOUND', 'The requested note was not found.');
    }
    return note;
  },
  async createNote(context, input) {
    assert.equal(context.userId, ALICE_ID);
    note = {
      ...note,
      name: input.name,
      path: input.name,
      folderId: input.folderId,
      content: input.content,
    };
    return note;
  },
  async saveNote(context, id, input) {
    if (context.userId !== ALICE_ID || id !== NOTE_ID) {
      throw new ApiError(404, 'NOT_FOUND', 'The requested note was not found.');
    }
    if (input.expectedRevision !== note.revision) {
      throw new ApiError(409, 'REVISION_CONFLICT', 'The note changed after it was opened.', {
        current: note,
      });
    }
    note = {
      ...note,
      content: input.content,
      revision: note.revision + 1,
      updatedAt: note.updatedAt + 1,
      size: Buffer.byteLength(input.content),
    };
    return note;
  },
  async updateNote(context, id, input) {
    if (context.userId !== ALICE_ID || id !== NOTE_ID) {
      throw new ApiError(404, 'NOT_FOUND', 'The requested note was not found.');
    }
    if (input.expectedRevision !== note.revision) {
      throw new ApiError(409, 'REVISION_CONFLICT', 'The note changed after it was opened.', { current: note });
    }
    note = {
      ...note,
      name: input.name,
      path: input.name,
      folderId: input.folderId,
      revision: note.revision + 1,
    };
    return note;
  },
  async deleteNote() {},
  async restoreNote() {
    return note;
  },
  async createFolder(context, input) {
    assert.equal(context.userId, ALICE_ID);
    return {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      name: input.name,
      parentId: input.parentId,
      updatedAt: 1,
    };
  },
  async updateFolder(context, id, input) {
    assert.equal(context.userId, ALICE_ID);
    return { id, name: input.name, parentId: input.parentId, updatedAt: 2 };
  },
  async deleteFolder() {},
  async restoreFolder() {},
  async searchNotes(context, query) {
    return context.userId === ALICE_ID && note.content.includes(query)
      ? [{ id: note.id, path: note.path, title: note.title, snippet: note.content, tags: note.tags, rank: 1 }]
      : [];
  },
  async listTags(context) {
    return context.userId === ALICE_ID ? [{ tag: 'guide', count: 1 }] : [];
  },
};

const dataTransferStore: DataTransferStore = {
  async importMarkdown(context, input) {
    assert.equal(context.userId, ALICE_ID);
    const entry = {
      sourcePath: input.files[0].path,
      targetPath: input.files[0].path,
      sha256: 'a'.repeat(64),
    };
    return {
      dryRun: input.mode === 'dry-run',
      imported: [entry],
      skipped: [],
      renamed: [],
      failed: [],
    };
  },
  async exportMarkdown(context) {
    assert.equal(context.userId, ALICE_ID);
    return { bytes: Uint8Array.from([80, 75, 3, 4]), filename: 'notes-backup.zip' };
  },
};

const app = createApp({
  noteStore,
  dataTransferStore,
  verifyAccessToken: async (accessToken) => {
    if (accessToken === 'alice-aal1') {
      return { userId: ALICE_ID, assuranceLevel: 'aal1' };
    }
    if (accessToken === 'alice-aal2') {
      return { userId: ALICE_ID, email: 'alice@example.test', assuranceLevel: 'aal2' };
    }
    if (accessToken === 'bob-aal2') {
      return { userId: BOB_ID, email: 'bob@example.test', assuranceLevel: 'aal2' };
    }
    return null;
  },
});

function request(pathname: string, init: RequestInit = {}, token = 'alice-aal2') {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return app.request(pathname, { ...init, headers });
}

test('cloud note API enforces MFA and non-disclosing ownership', async () => {
  assert.equal((await app.request('/api/notes')).status, 401);
  assert.equal((await request('/api/notes', {}, 'alice-aal1')).status, 403);
  assert.equal((await request(`/api/notes/${NOTE_ID}`, {}, 'bob-aal2')).status, 404);

  const session = await request('/api/session');
  assert.deepEqual(await session.json(), {
    userId: ALICE_ID,
    email: 'alice@example.test',
    assuranceLevel: 'aal2',
  });
});

test('cloud note API validates UUIDs and revision-aware saves', async () => {
  const invalidId = await request('/api/notes/not-a-uuid');
  assert.equal(invalidId.status, 400);
  assert.equal((await invalidId.json()).error.code, 'INVALID_REQUEST');

  const malformedSave = await request(`/api/notes/${NOTE_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '# Invalid' }),
  });
  assert.equal(malformedSave.status, 400);

  const saved = await request(`/api/notes/${NOTE_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '# Saved', expectedRevision: 1 }),
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).revision, 2);

  const stale = await request(`/api/notes/${NOTE_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '# Stale overwrite', expectedRevision: 1 }),
  });
  assert.equal(stale.status, 409);
  const conflict = await stale.json();
  assert.equal(conflict.error.code, 'REVISION_CONFLICT');
  assert.equal(conflict.error.details.current.content, '# Saved');
  assert.equal(conflict.error.details.current.revision, 2);
});

test('cloud tree mutations use stable UUIDs and explicit revisions', async () => {
  const folder = await request('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Projects', parentId: null }),
  });
  assert.equal(folder.status, 201);
  assert.equal((await folder.json()).id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');

  const renamed = await request(`/api/notes/${NOTE_ID}/metadata`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'renamed.md', folderId: null, expectedRevision: 2 }),
  });
  assert.equal(renamed.status, 200);
  const renamedNote = await renamed.json();
  assert.equal(renamedNote.id, NOTE_ID);
  assert.equal(renamedNote.revision, 3);

  const deleted = await request(`/api/notes/${NOTE_ID}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision: 3 }),
  });
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { success: true });

  const trash = await request('/api/trash');
  assert.equal(trash.status, 200);
  assert.equal((await trash.json())[0].id, NOTE_ID);
});

test('Markdown transfer routes validate previews and return ZIP downloads', async () => {
  const invalid = await request('/api/import/markdown', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'dry-run', files: [{ path: '../bad.md' }] }),
  });
  assert.equal(invalid.status, 400);

  const preview = await request('/api/import/markdown', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'dry-run', files: [{ path: 'fixture.md', content: '# Fixture' }] }),
  });
  assert.equal(preview.status, 200);
  assert.equal((await preview.json()).dryRun, true);

  const archive = await request('/api/export/markdown');
  assert.equal(archive.status, 200);
  assert.equal(archive.headers.get('Content-Type'), 'application/zip');
  assert.equal(archive.headers.get('Content-Disposition'), 'attachment; filename="notes-backup.zip"');
  assert.deepEqual(new Uint8Array(await archive.arrayBuffer()), Uint8Array.from([80, 75, 3, 4]));
});
