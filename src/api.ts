import type {
  AppConfig,
  FileNode,
  NoteMetadata,
  NoteDocument,
  FtsSearchResult,
  TagCount,
} from './types.ts';

const BASE_URL = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const data = await res.json() as { error?: string };
      if (data && typeof data.error === 'string') {
        errorDetail = data.error;
      }
    } catch {
      // Ignore JSON parse errors on non-OK responses
    }
    throw new Error(`API Error ${res.status}: ${errorDetail}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch(`${BASE_URL}/config`);
  return handleResponse<AppConfig>(res);
}

export async function updateConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
  const res = await fetch(`${BASE_URL}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return handleResponse<AppConfig>(res);
}

export async function fetchTree(): Promise<FileNode[]> {
  const res = await fetch(`${BASE_URL}/tree`);
  return handleResponse<FileNode[]>(res);
}

export async function fetchNotes(): Promise<NoteMetadata[]> {
  const res = await fetch(`${BASE_URL}/notes`);
  return handleResponse<NoteMetadata[]>(res);
}

export async function fetchNote(id: string): Promise<NoteDocument> {
  const encoded = id.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${BASE_URL}/notes/${encoded}`);
  return handleResponse<NoteDocument>(res);
}

export async function saveNoteContent(id: string, content: string): Promise<NoteDocument> {
  const encoded = id.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${BASE_URL}/notes/${encoded}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  return handleResponse<NoteDocument>(res);
}

export async function createNote(id: string, content: string = ''): Promise<NoteDocument> {
  const res = await fetch(`${BASE_URL}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, content }),
  });
  return handleResponse<NoteDocument>(res);
}

export async function deleteNote(id: string): Promise<void> {
  const encoded = id.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${BASE_URL}/notes/${encoded}`, {
    method: 'DELETE',
  });
  await handleResponse<{ success: boolean }>(res);
}

export async function createFolder(path: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  await handleResponse<{ success: boolean }>(res);
}

export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPath, newPath }),
  });
  await handleResponse<{ success: boolean }>(res);
}

export async function searchNotes(query: string, limit: number = 30): Promise<FtsSearchResult[]> {
  const res = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  return handleResponse<FtsSearchResult[]>(res);
}

export async function fetchTags(): Promise<TagCount[]> {
  const res = await fetch(`${BASE_URL}/tags`);
  return handleResponse<TagCount[]>(res);
}
