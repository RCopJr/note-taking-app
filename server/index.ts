import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import {
  loadConfig,
  saveConfig,
  getConfig,
} from './config.ts';
import {
  initDb,
  getAllNotes,
  searchNotesFts,
  getAllTags,
} from './db.ts';
import { LocalFileStorageProvider } from './storage.ts';

const app = new Hono();

// Enable CORS for local Vite dev server
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

let storageProvider: LocalFileStorageProvider | null = null;

export function getStorage(): LocalFileStorageProvider {
  if (!storageProvider) {
    const config = getConfig();
    storageProvider = new LocalFileStorageProvider(config.notesDir);
  }
  return storageProvider;
}

// Parse CLI flags
function parseArgs(): { port: number; dir?: string } {
  const args = process.argv.slice(2);
  let port = 3001;
  let dir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10) || 3001;
      i++;
    } else if (args[i] === '--dir' && args[i + 1]) {
      dir = args[i + 1];
      i++;
    }
  }

  return { port, dir };
}

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

// Config
app.get('/api/config', (c) => {
  return c.json(getConfig());
});

app.put('/api/config', async (c) => {
  const body = await c.req.json();
  const updated = await saveConfig(body);
  if (body.notesDir) {
    getStorage().setNotesDir(updated.notesDir);
    await getStorage().syncAllNotes();
  }
  return c.json(updated);
});

// File tree
app.get('/api/tree', async (c) => {
  const tree = await getStorage().listTree();
  return c.json(tree);
});

// Notes list
app.get('/api/notes', (c) => {
  const notes = getAllNotes();
  return c.json(notes);
});

// Note by ID
app.get('/api/notes/:id{.+$}', async (c) => {
  const id = decodeURIComponent(c.req.param('id'));
  try {
    const note = await getStorage().getNote(id);
    return c.json(note);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Note not found';
    return c.json({ error: message }, 404);
  }
});

// Create note
app.post('/api/notes', async (c) => {
  const body = await c.req.json<{ id: string; content: string }>();
  if (!body.id) {
    return c.json({ error: 'Missing note id/path' }, 400);
  }
  const note = await getStorage().saveNote(body.id, body.content || '');
  return c.json(note, 201);
});

// Update note content
app.put('/api/notes/:id{.+$}', async (c) => {
  const id = decodeURIComponent(c.req.param('id'));
  const body = await c.req.json<{ content: string }>();
  const note = await getStorage().saveNote(id, body.content ?? '');
  return c.json(note);
});

// Delete note or directory
app.delete('/api/notes/:id{.+$}', async (c) => {
  const id = decodeURIComponent(c.req.param('id'));
  await getStorage().deleteNote(id);
  return c.json({ success: true });
});

// Create directory
app.post('/api/folders', async (c) => {
  const body = await c.req.json<{ path: string }>();
  if (!body.path) {
    return c.json({ error: 'Missing folder path' }, 400);
  }
  await getStorage().createFolder(body.path);
  return c.json({ success: true }, 201);
});

// Rename / Move
app.post('/api/rename', async (c) => {
  const body = await c.req.json<{ oldPath: string; newPath: string }>();
  if (!body.oldPath || !body.newPath) {
    return c.json({ error: 'Missing oldPath or newPath' }, 400);
  }
  await getStorage().renamePath(body.oldPath, body.newPath);
  return c.json({ success: true });
});

// Search FTS
app.get('/api/search', (c) => {
  const q = c.req.query('q') || '';
  const limit = parseInt(c.req.query('limit') || '30', 10);
  const results = searchNotesFts(q, limit);
  return c.json(results);
});

// Tags
app.get('/api/tags', (c) => {
  const tags = getAllTags();
  return c.json(tags);
});

// Resync
app.post('/api/sync', async (c) => {
  const count = await getStorage().syncAllNotes();
  return c.json({ synced: count });
});

// ---------------------------------------------------------------------------
// Server Bootstrap
// ---------------------------------------------------------------------------

async function main() {
  const { port, dir } = parseArgs();
  const config = await loadConfig(dir);
  initDb();

  const storage = getStorage();
  await storage.syncAllNotes();
  storage.startWatcher();

  console.log(`[Notes] Storage directory: ${config.notesDir}`);
  console.log(`[Notes] Server running on http://127.0.0.1:${port}`);

  serve({
    fetch: app.fetch,
    port,
  });
}

// Only start if run as main
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Fatal server startup error:', err);
    process.exit(1);
  });
}

export { app };
