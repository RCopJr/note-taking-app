import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import {
  buildMarkdownArchive,
  planMarkdownImport,
} from '../server/data-transfer.ts';

const NOTE_ONE_ID = '11111111-1111-4111-8111-111111111111';
const NOTE_TWO_ID = '22222222-2222-4222-8222-222222222222';
const NOTE_THREE_ID = '33333333-3333-4333-8333-333333333333';
const FOLDER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

test('Markdown fixture hierarchy survives export and empty-state re-import', async () => {
  const source = [
    { path: 'root.md', content: '---\ntags: [Fixture]\n---\n# Root\n' },
    { path: 'projects/plan.md', content: '# Plan\n\nFirst line.\n' },
    { path: 'projects/raw.txt', content: 'plain text\n' },
  ];
  const emptyState = { folders: [], notes: [], imports: [] };
  const firstPlan = await planMarkdownImport(source, emptyState);
  assert.deepEqual(firstPlan.map((item) => [item.sourcePath, item.targetPath, item.status]), [
    ['projects/plan.md', 'projects/plan.md', 'imported'],
    ['projects/raw.txt', 'projects/raw.txt', 'imported'],
    ['root.md', 'root.md', 'imported'],
  ]);

  const archive = buildMarkdownArchive(
    [{ id: FOLDER_ID, name: 'projects', parent_id: null }],
    [
      {
        id: NOTE_ONE_ID,
        folder_id: null,
        name: 'root.md',
        content: source[0].content,
        revision: 2,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-02T00:00:00.000Z',
      },
      {
        id: NOTE_TWO_ID,
        folder_id: FOLDER_ID,
        name: 'plan.md',
        content: source[1].content,
        revision: 1,
        created_at: '2026-09-03T00:00:00.000Z',
        updated_at: '2026-09-03T00:00:00.000Z',
      },
      {
        id: NOTE_THREE_ID,
        folder_id: FOLDER_ID,
        name: 'raw.txt',
        content: source[2].content,
        revision: 4,
        created_at: '2026-09-04T00:00:00.000Z',
        updated_at: '2026-09-05T00:00:00.000Z',
      },
    ],
  );
  const unzipped = unzipSync(archive.bytes);
  const exportedFiles = Object.entries(unzipped)
    .filter(([path]) => /\.(md|txt)$/i.test(path))
    .map(([path, bytes]) => ({ path, content: strFromU8(bytes) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const manifest = JSON.parse(strFromU8(unzipped['_notes-export-manifest.json'])) as {
    version: number;
    notes: Array<{ id: string; path: string; exportPath: string; revision: number }>;
  };

  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.notes.map((note) => [note.id, note.path, note.exportPath, note.revision]), [
    [NOTE_TWO_ID, 'projects/plan.md', 'projects/plan.md', 1],
    [NOTE_THREE_ID, 'projects/raw.txt', 'projects/raw.txt', 4],
    [NOTE_ONE_ID, 'root.md', 'root.md', 2],
  ]);
  assert.deepEqual(
    exportedFiles.map((file) => [file.path, hash(file.content)]),
    source.map((file) => [file.path, hash(file.content)]).sort(([left], [right]) => left.localeCompare(right)),
  );

  const roundTripPlan = await planMarkdownImport(exportedFiles, emptyState);
  assert.equal(roundTripPlan.length, source.length);
  assert.ok(roundTripPlan.every((item) => item.status === 'imported'));
});

test('Markdown export gives extensionless cloud notes an importable filename', () => {
  const archive = buildMarkdownArchive([], [{
    id: NOTE_ONE_ID,
    folder_id: null,
    name: 'journal',
    content: '# Journal',
    revision: 1,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  }]);
  const unzipped = unzipSync(archive.bytes);
  assert.equal(strFromU8(unzipped['journal.md']), '# Journal');
  const manifest = JSON.parse(strFromU8(unzipped['_notes-export-manifest.json'])) as {
    notes: Array<{ path: string; exportPath: string }>;
  };
  assert.deepEqual(manifest.notes, [{
    id: NOTE_ONE_ID,
    path: 'journal',
    exportPath: 'journal.md',
    revision: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }]);
});

test('Markdown import reports retry, collision, and unsafe paths deterministically', async () => {
  const existingContent = '# Existing\n';
  const existingHash = hash(existingContent);
  const state = {
    folders: [],
    notes: [{ id: NOTE_ONE_ID, folder_id: null, name: 'same.md', content: existingContent }],
    imports: [{
      source_path: 'same.md',
      source_hash: existingHash,
      imported_path: 'same.md',
      note_id: NOTE_ONE_ID,
    }],
  };
  const plan = await planMarkdownImport([
    { path: '../escape.md', content: 'blocked' },
    { path: 'same.md', content: existingContent },
    { path: 'same.md', content: '# Changed\n' },
    { path: 'trimmed / note.md ', content: '# Trimmed\n' },
  ], state);

  assert.deepEqual(plan.map((item) => [item.sourcePath, item.targetPath, item.status]), [
    ['../escape.md', null, 'failed'],
    ['same.md', 'same (imported 2).md', 'renamed'],
    ['same.md', 'same.md', 'skipped'],
    ['trimmed / note.md ', 'trimmed/note.md', 'renamed'],
  ]);
});

test('Markdown export refuses portable filename collisions', () => {
  assert.throws(
    () => buildMarkdownArchive([], [
      {
        id: NOTE_ONE_ID,
        folder_id: null,
        name: 'Readme.md',
        content: 'one',
        revision: 1,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
      },
      {
        id: NOTE_TWO_ID,
        folder_id: null,
        name: 'README.md',
        content: 'two',
        revision: 1,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
      },
    ]),
    /portable filename collision/,
  );
});
