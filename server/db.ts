import { DatabaseSync } from 'node:sqlite';
import { DB_FILE } from './config.ts';

export interface NoteMetadata {
  id: string;
  path: string;
  title: string;
  tags: string[];
  size: number;
  updatedAt: number;
}

export interface FtsSearchResult {
  id: string;
  title: string;
  snippet: string;
  tags: string[];
  rank: number;
}

interface NoteRow {
  id: string;
  path: string;
  title: string;
  tags: string;
  size: number;
  updated_at: number;
}

interface FtsRow {
  id: string;
  title: string;
  snippet: string;
  rank: number;
  tags: string | null;
}

let dbInstance: DatabaseSync | null = null;

function mapNoteRow(r: NoteRow): NoteMetadata {
  return {
    id: r.id,
    path: r.path,
    title: r.title,
    tags: JSON.parse(r.tags || '[]') as string[],
    size: r.size,
    updatedAt: r.updated_at,
  };
}

export function initDb(dbPath: string = DB_FILE): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  // Metadata table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      title TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      size INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `);

  // FTS5 Virtual Table
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      id UNINDEXED,
      title,
      content,
      tags,
      tokenize = 'porter unicode61'
    );
  `);

  dbInstance = db;
  return db;
}

export function indexNote(
  id: string,
  relativePath: string,
  title: string,
  content: string,
  tags: string[],
  size: number,
  updatedAt: number
): void {
  const db = dbInstance || initDb();

  const insertMeta = db.prepare(`
    INSERT INTO notes (id, path, title, tags, size, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      path = excluded.path,
      title = excluded.title,
      tags = excluded.tags,
      size = excluded.size,
      updated_at = excluded.updated_at;
  `);

  const deleteFts = db.prepare('DELETE FROM notes_fts WHERE id = ?;');
  const insertFts = db.prepare(`
    INSERT INTO notes_fts (id, title, content, tags)
    VALUES (?, ?, ?, ?);
  `);

  insertMeta.run(id, relativePath, title, JSON.stringify(tags), size, updatedAt);
  deleteFts.run(id);
  insertFts.run(id, title, content, tags.join(' '));
}

export function deleteNoteFromDb(id: string): void {
  const db = dbInstance || initDb();
  const childPattern = `${id}/%`;
  db.prepare('DELETE FROM notes WHERE id = ? OR id LIKE ?;').run(id, childPattern);
  db.prepare('DELETE FROM notes_fts WHERE id = ? OR id LIKE ?;').run(id, childPattern);
}

export function getAllNotes(): NoteMetadata[] {
  const db = dbInstance || initDb();
  const rows = db.prepare('SELECT id, path, title, tags, size, updated_at FROM notes ORDER BY updated_at DESC;').all() as unknown as NoteRow[];
  return rows.map(mapNoteRow);
}

export function getNoteById(id: string): NoteMetadata | null {
  const db = dbInstance || initDb();
  const row = db.prepare('SELECT id, path, title, tags, size, updated_at FROM notes WHERE id = ?;').get(id) as unknown as NoteRow | undefined;
  return row ? mapNoteRow(row) : null;
}

export function searchNotesFts(query: string, limit: number = 30): FtsSearchResult[] {
  const db = dbInstance || initDb();
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Format terms for prefix matching (e.g., 'term*')
  const formattedQuery = trimmed
    .replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word}*`)
    .join(' ');

  if (!formattedQuery) return [];

  try {
    const stmt = db.prepare(`
      SELECT
        f.id,
        f.title,
        snippet(notes_fts, 2, '<mark>', '</mark>', '...', 15) as snippet,
        bm25(notes_fts) as rank,
        n.tags
      FROM notes_fts f
      LEFT JOIN notes n ON n.id = f.id
      WHERE notes_fts MATCH ?
      ORDER BY rank
      LIMIT ?;
    `);

    const rows = stmt.all(formattedQuery, limit) as unknown as FtsRow[];

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      snippet: r.snippet || '',
      tags: JSON.parse(r.tags || '[]') as string[],
      rank: r.rank,
    }));
  } catch {
    // If the FTS syntax fails on bizarre input, fall back to LIKE search
    const likePattern = `%${trimmed}%`;
    const fallback = db.prepare(`
      SELECT id, path, title, tags, size, updated_at
      FROM notes
      WHERE title LIKE ? OR path LIKE ?
      LIMIT ?;
    `).all(likePattern, likePattern, limit) as unknown as NoteRow[];

    return fallback.map((r) => ({
      id: r.id,
      title: r.title,
      snippet: r.title,
      tags: JSON.parse(r.tags || '[]') as string[],
      rank: 0,
    }));
  }
}

export function getAllTags(): Array<{ tag: string; count: number }> {
  const notes = getAllNotes();
  const counts: Record<string, number> = {};

  for (const note of notes) {
    for (const tag of note.tags) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }

  return Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}
