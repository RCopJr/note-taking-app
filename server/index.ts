import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import {
  loadConfig,
  saveConfig,
  getConfig,
} from './config.ts';
import {
  BiblePassageError,
  fetchBiblePassage,
  getBibleStatus,
} from './bible.ts';
import {
  biblePassageQuerySchema,
  createNoteRequestSchema,
  saveNoteRequestSchema,
  searchQuerySchema,
  updateAppConfigSchema,
  noteIdSchema,
  type AuthSession,
} from '../shared/contracts.ts';
import {
  ApiError,
  errorResponse,
  parseInput,
  parseJsonBody,
} from './http.ts';
import {
  requireAuthentication,
  type AuthVariables,
  type VerifyAccessToken,
} from './auth.ts';
import {
  SupabaseCloudNoteStore,
  type CloudNoteStore,
} from './cloud-notes.ts';


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
interface CreateAppOptions {
  verifyAccessToken?: VerifyAccessToken;
  noteStore?: CloudNoteStore;
}

export function createApp(options: CreateAppOptions = {}) {
  const noteStore = options.noteStore ?? new SupabaseCloudNoteStore();
  const app = new Hono<{ Variables: AuthVariables }>();

  // Only the local Vite client may call the development API cross-origin.
  app.use('*', cors({
    origin: ['http://127.0.0.1:5173', 'http://localhost:5173'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
  }));

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return errorResponse(c, error);
    }
    console.error('Unhandled API error:', error);
    return errorResponse(c, new ApiError(500, 'INTERNAL_ERROR', 'The request could not be completed.'));
  });

  app.use('/api/*', requireAuthentication('aal2', options.verifyAccessToken));

  app.get('/api/session', (c) => {
    const identity = c.get('authIdentity');
    const session: AuthSession = {
      userId: identity.userId,
      ...(identity.email ? { email: identity.email } : {}),
      assuranceLevel: 'aal2',
    };
    return c.json(session);
  });


// Config
app.get('/api/config', (c) => {
  return c.json(getConfig());
});

app.put('/api/config', async (c) => {
  const updates = await parseJsonBody(c, updateAppConfigSchema);
  return c.json(await saveConfig(updates));
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

// Cloud note tree and list
app.get('/api/tree', async (c) => {
  return c.json(await noteStore.listTree({
    accessToken: c.get('accessToken'),
    userId: c.get('userId'),
  }));
});

app.get('/api/notes', async (c) => {
  return c.json(await noteStore.listNotes({
    accessToken: c.get('accessToken'),
    userId: c.get('userId'),
  }));
});

// Cloud note by UUID
app.get('/api/notes/:id', async (c) => {
  const id = parseInput(noteIdSchema, c.req.param('id'));
  return c.json(await noteStore.getNote({
    accessToken: c.get('accessToken'),
    userId: c.get('userId'),
  }, id));
});

app.post('/api/notes', async (c) => {
  const body = await parseJsonBody(c, createNoteRequestSchema);
  const note = await noteStore.createNote({
    accessToken: c.get('accessToken'),
    userId: c.get('userId'),
  }, body);
  return c.json(note, 201);
});

app.put('/api/notes/:id', async (c) => {
  const id = parseInput(noteIdSchema, c.req.param('id'));
  const body = await parseJsonBody(c, saveNoteRequestSchema);
  return c.json(await noteStore.saveNote({
    accessToken: c.get('accessToken'),
    userId: c.get('userId'),
  }, id, body));
});

// Remaining cloud mutations arrive in Phase 5. Refuse them rather than
// accidentally mutating the preserved Markdown source directory.
app.delete('/api/notes/:id', () => {
  throw new ApiError(501, 'NOT_IMPLEMENTED', 'Cloud note deletion is not available yet.');
});

app.post('/api/folders', () => {
  throw new ApiError(501, 'NOT_IMPLEMENTED', 'Cloud folder creation is not available yet.');
});

app.post('/api/rename', () => {
  throw new ApiError(501, 'NOT_IMPLEMENTED', 'Cloud rename and move are not available yet.');
});

app.get('/api/search', async (c) => {
  const query = parseInput(searchQuerySchema, {
    q: c.req.query('q'),
    limit: c.req.query('limit'),
  });
  return c.json(await noteStore.searchNotes({
    accessToken: c.get('accessToken'),
    userId: c.get('userId'),
  }, query.q, query.limit));
});

app.get('/api/tags', async (c) => {
  return c.json(await noteStore.listTags({
    accessToken: c.get('accessToken'),
    userId: c.get('userId'),
  }));
});

app.post('/api/sync', () => {
  throw new ApiError(501, 'NOT_IMPLEMENTED', 'Filesystem synchronization is disabled for cloud notes.');
});

app.notFound((c) => {
  return errorResponse(c, new ApiError(404, 'NOT_FOUND', 'The requested API route was not found.'));
});

  return app;
}

const app = createApp();

// ---------------------------------------------------------------------------
// Server Bootstrap
// ---------------------------------------------------------------------------

async function main() {
  const { port, dir } = parseArgs();
  await loadConfig(dir);

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
