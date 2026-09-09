import type { ZodType } from 'zod/v4';
import {
  apiErrorResponseSchema,
  appConfigSchema,
  biblePassageSchema,
  bibleStatusSchema,
  fileTreeSchema,
  ftsSearchResultsSchema,
  noteDocumentSchema,
  noteMetadataSchema,
  successResponseSchema,
  tagCountsSchema,
  type ApiErrorCode,
  type AppConfig,
  type BiblePassage,
  type BibleStatus,
  type FileNode,
  type FtsSearchResult,
  type NoteDocument,
  type NoteMetadata,
  type TagCount,
  type UpdateAppConfig,
} from '../shared/contracts.ts';

const BASE_URL = '/api';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | 'INVALID_RESPONSE';
  readonly details?: unknown;

  constructor(status: number, code: ApiErrorCode | 'INVALID_RESPONSE', message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new ApiClientError(res.status, 'INVALID_RESPONSE', 'The server returned invalid JSON.');
  }
}

async function handleResponse<T>(res: Response, schema: ZodType<T>): Promise<T> {
  const body = await readJson(res);
  if (!res.ok) {
    const error = apiErrorResponseSchema.safeParse(body);
    if (error.success) {
      throw new ApiClientError(
        res.status,
        error.data.error.code,
        error.data.error.message,
        error.data.error.details,
      );
    }
    throw new ApiClientError(res.status, 'INVALID_RESPONSE', 'The server returned an invalid error response.');
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiClientError(res.status, 'INVALID_RESPONSE', 'The server response does not match the API contract.');
  }
  return result.data;
}

export async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch(`${BASE_URL}/config`);
  return handleResponse(res, appConfigSchema);
}

export async function updateConfig(updates: UpdateAppConfig): Promise<AppConfig> {
  const res = await fetch(`${BASE_URL}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return handleResponse(res, appConfigSchema);
}

export async function fetchBibleStatus(): Promise<BibleStatus> {
  const res = await fetch(`${BASE_URL}/bible/status`);
  return handleResponse(res, bibleStatusSchema);
}

export async function fetchBiblePassage(
  reference: string,
  version: string,
): Promise<BiblePassage> {
  const params = new URLSearchParams({ reference, version });
  const res = await fetch(`${BASE_URL}/bible/passage?${params}`);
  return handleResponse(res, biblePassageSchema);
}

export async function fetchTree(): Promise<FileNode[]> {
  const res = await fetch(`${BASE_URL}/tree`);
  return handleResponse(res, fileTreeSchema);
}

export async function fetchNotes(): Promise<NoteMetadata[]> {
  const res = await fetch(`${BASE_URL}/notes`);
  return handleResponse(res, noteMetadataSchema.array());
}

export async function fetchNote(id: string): Promise<NoteDocument> {
  const encoded = id.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${BASE_URL}/notes/${encoded}`);
  return handleResponse(res, noteDocumentSchema);
}

export async function saveNoteContent(id: string, content: string): Promise<NoteDocument> {
  const encoded = id.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${BASE_URL}/notes/${encoded}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  return handleResponse(res, noteDocumentSchema);
}

export async function createNote(id: string, content: string = ''): Promise<NoteDocument> {
  const res = await fetch(`${BASE_URL}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, content }),
  });
  return handleResponse(res, noteDocumentSchema);
}

export async function deleteNote(id: string): Promise<void> {
  const encoded = id.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${BASE_URL}/notes/${encoded}`, {
    method: 'DELETE',
  });
  await handleResponse(res, successResponseSchema);
}

export async function createFolder(path: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  await handleResponse(res, successResponseSchema);
}

export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPath, newPath }),
  });
  await handleResponse(res, successResponseSchema);
}

export async function searchNotes(query: string, limit: number = 30): Promise<FtsSearchResult[]> {
  const res = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  return handleResponse(res, ftsSearchResultsSchema);
}

export async function fetchTags(): Promise<TagCount[]> {
  const res = await fetch(`${BASE_URL}/tags`);
  return handleResponse(res, tagCountsSchema);
}
