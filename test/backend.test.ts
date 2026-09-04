import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { app } from '../server/index.ts';
import { loadConfig } from '../server/config.ts';
import { initDb } from '../server/db.ts';

async function runTests() {
  console.log('--- Starting Phase 1 Backend Verification ---');

  const testDir = path.join(os.tmpdir(), `notes-test-${Date.now()}`);
  const testDb = path.join(testDir, 'test.db');
  await fs.mkdir(testDir, { recursive: true });

  // Initialize config and db in test directory
  await loadConfig(testDir);
  initDb(testDb);

  // Sync to ensure storage provider points to testDir
  const syncRes = await app.request('/api/sync', { method: 'POST' });
  assert.equal(syncRes.status, 200, 'Sync should return 200');

  // 1. Test Config
  console.log('1. Testing GET /api/config');
  const configRes = await app.request('/api/config');
  assert.equal(configRes.status, 200);
  const config = await configRes.json();
  assert.ok(config.notesDir, 'Config must have notesDir');
  assert.equal(config.leaderKey, '<Space>');

  // 2. Test Note Creation with frontmatter tags and markdown title
  console.log('2. Testing POST /api/notes (create)');
  const noteContent = `---
title: Welcome to Vim Notes
tags: [getting-started, guide, test]
---

# Welcome to Vim Notes

This is a test note to verify Google Docs export, Vim motions, and SQLite FTS5 search indexing.
`;

  const createRes = await app.request('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'guides/welcome.md',
      content: noteContent,
    }),
  });

  assert.equal(createRes.status, 201, 'Create note should return 201');
  const createdNote = await createRes.json();
  assert.equal(createdNote.id, 'guides/welcome.md');
  assert.equal(createdNote.title, 'Welcome to Vim Notes');
  assert.deepEqual(createdNote.tags, ['getting-started', 'guide', 'test']);

  // 3. Test Note Retrieval
  console.log('3. Testing GET /api/notes/:id');
  const getRes = await app.request('/api/notes/guides/welcome.md');
  assert.equal(getRes.status, 200);
  const fetchedNote = await getRes.json();
  assert.equal(fetchedNote.title, 'Welcome to Vim Notes');
  assert.ok(fetchedNote.content.includes('Google Docs export'));

  // 4. Test Second Note for FTS Search
  console.log('4. Testing FTS search on multiple notes');
  await app.request('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'work/architecture.md',
      content: `# Architecture Decisions\n\nWe decided to use Vite, React, Hono, and SQLite FTS5 for instant BM25 search.`,
    }),
  });

  // 5. Test FTS Search
  const searchRes = await app.request('/api/search?q=Vite');
  assert.equal(searchRes.status, 200);
  const searchResults = await searchRes.json();
  assert.ok(searchResults.length >= 1, 'Should find at least 1 result for "Vite"');
  assert.equal(searchResults[0].id, 'work/architecture.md');
  assert.ok(searchResults[0].snippet.includes('<mark>Vite</mark>'), 'Snippet must highlight search term');

  // Search for "Google Docs"
  const searchDocsRes = await app.request('/api/search?q=Google+Docs');
  const searchDocsResults = await searchDocsRes.json();
  assert.ok(searchDocsResults.length >= 1);
  assert.equal(searchDocsResults[0].id, 'guides/welcome.md');

  // 6. Test Tags
  console.log('5. Testing GET /api/tags');
  const tagsRes = await app.request('/api/tags');
  assert.equal(tagsRes.status, 200);
  const tags = await tagsRes.json();
  assert.ok(tags.some((t: { tag: string }) => t.tag === 'getting-started'));

  // 7. Test Tree Listing
  console.log('6. Testing GET /api/tree');
  const treeRes = await app.request('/api/tree');
  assert.equal(treeRes.status, 200);
  const tree = await treeRes.json();
  assert.ok(tree.some((n: { name: string }) => n.name === 'guides' || n.name === 'work'));

  // 8. Test Update Note
  console.log('7. Testing PUT /api/notes/:id');
  const updateRes = await app.request('/api/notes/guides/welcome.md', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: '# Updated Welcome\n\nBrand new updated content.',
    }),
  });
  assert.equal(updateRes.status, 200);
  const updatedNote = await updateRes.json();
  assert.equal(updatedNote.title, 'Updated Welcome');

  // 9. Test Delete Note
  console.log('8. Testing DELETE /api/notes/:id');
  const deleteRes = await app.request('/api/notes/guides/welcome.md', {
    method: 'DELETE',
  });
  assert.equal(deleteRes.status, 200);

  const getDeletedRes = await app.request('/api/notes/guides/welcome.md');
  assert.equal(getDeletedRes.status, 404, 'Deleted note should return 404');

  // Cleanup
  await fs.rm(testDir, { recursive: true, force: true });
  console.log('✅ All Phase 1 Backend Verification Tests Passed!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
