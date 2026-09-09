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
import {
  BiblePassageError,
  fetchBiblePassage,
  getBibleStatus,
} from './bible.ts';
import {
  biblePassageQuerySchema,
  createFolderRequestSchema,
  createNoteRequestSchema,
  localPathSchema,
  renamePathRequestSchema,
  saveNoteRequestSchema,
  searchQuerySchema,
  updateAppConfigSchema,
} from '../shared/contracts.ts';
import {
  ApiError,
  errorResponse,
  parseInput,
  parseJsonBody,
} from './http.ts';

const app = new Hono();

// The API controls local files. Only the local Vite client may call it
// cross-origin during development.
app.use('*', cors({
  origin: ['http://127.0.0.1:5173', 'http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return errorResponse(c, error);
  }
  console.error('Unhandled API error:', error);
  return errorResponse(c, new ApiError(500, 'INTERNAL_ERROR', 'The request could not be completed.'));
});

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
  const updates = await parseJsonBody(c, updateAppConfigSchema);
  const updated = await saveConfig(updates);
  if (updates.notesDir) {
    getStorage().setNotesDir(updated.notesDir);
    await getStorage().syncAllNotes();
  }
  return c.json(updated);
});

// Bible passages
app.get('/api/bible/status', (c) => {
  return c.json(getBibleStatus());
});

app.get('/api/bible/passage', async (c) => {
  const query = parseInput(biblePassageQuerySchema, {
    reference: c.req.query('reference'),
    version: c.req.query('version'),
  });
  try {
    return c.json(await fetchBiblePassage(query.reference, query.version));
  } catch (error) {
    if (error instanceof BiblePassageError) {
      const code = error.status === 400
        ? 'INVALID_REQUEST'
        : error.status === 503
          ? 'CONFIGURATION_ERROR'
          : 'EXTERNAL_SERVICE_ERROR';
      throw new ApiError(error.status, code, error.message);
    }
    throw new ApiError(502, 'EXTERNAL_SERVICE_ERROR', 'Bible passage lookup failed.');
  }
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
  const id = parseInput(localPathSchema, decodeURIComponent(c.req.param('id')));
  try {
    return c.json(await getStorage().getNote(id));
  } catch {
    throw new ApiError(404, 'NOT_FOUND', 'The requested note was not found.');
  }
});

// Create note
app.post('/api/notes', async (c) => {
  const body = await parseJsonBody(c, createNoteRequestSchema);
  const note = await getStorage().saveNote(body.id, body.content);
  return c.json(note, 201);
});

// Update note content
app.put('/api/notes/:id{.+$}', async (c) => {
  const id = parseInput(localPathSchema, decodeURIComponent(c.req.param('id')));
  const body = await parseJsonBody(c, saveNoteRequestSchema);
  const note = await getStorage().saveNote(id, body.content);
  return c.json(note);
});

// Delete note or directory
app.delete('/api/notes/:id{.+$}', async (c) => {
  const id = parseInput(localPathSchema, decodeURIComponent(c.req.param('id')));
  await getStorage().deleteNote(id);
  return c.json({ success: true as const });
});

// Create directory
app.post('/api/folders', async (c) => {
  const body = await parseJsonBody(c, createFolderRequestSchema);
  await getStorage().createFolder(body.path);
  return c.json({ success: true as const }, 201);
});

// Rename / Move
app.post('/api/rename', async (c) => {
  const body = await parseJsonBody(c, renamePathRequestSchema);
  await getStorage().renamePath(body.oldPath, body.newPath);
  return c.json({ success: true as const });
});

// Search FTS
app.get('/api/search', (c) => {
  const query = parseInput(searchQuerySchema, {
    q: c.req.query('q'),
    limit: c.req.query('limit'),
  });
  return c.json(searchNotesFts(query.q, query.limit));
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

app.notFound((c) => {
  return errorResponse(c, new ApiError(404, 'NOT_FOUND', 'The requested API route was not found.'));
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
    hostname: '127.0.0.1',
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
