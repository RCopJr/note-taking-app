import type { Database } from '../shared/database.types.ts';
import type {
  CreateNoteRequest,
  FileNode,
  FtsSearchResult,
  NoteDocument,
  NoteMetadata,
  SaveNoteRequest,
  TagCount,
} from '../shared/contracts.ts';
import { ApiError } from './http.ts';
import { buildNoteSearchText, parseMarkdownMetadata } from './markdown.ts';
import { createServerSupabaseClient } from './supabase.ts';

type FolderRow = Database['public']['Tables']['folders']['Row'];
type NoteRow = Database['public']['Tables']['notes']['Row'];
type SaveNoteRow = Database['public']['Functions']['save_note']['Returns'][number];

export interface CloudRequestContext {
  accessToken: string;
  userId: string;
}

export interface CloudNoteStore {
  listNotes(context: CloudRequestContext): Promise<NoteMetadata[]>;
  listTree(context: CloudRequestContext): Promise<FileNode[]>;
  getNote(context: CloudRequestContext, id: string): Promise<NoteDocument>;
  createNote(context: CloudRequestContext, input: CreateNoteRequest): Promise<NoteDocument>;
  saveNote(context: CloudRequestContext, id: string, input: SaveNoteRequest): Promise<NoteDocument>;
  searchNotes(context: CloudRequestContext, query: string, limit: number): Promise<FtsSearchResult[]>;
  listTags(context: CloudRequestContext): Promise<TagCount[]>;
}

function failDatabaseOperation(): never {
  throw new ApiError(500, 'INTERNAL_ERROR', 'The cloud note operation could not be completed.');
}

function folderPaths(folders: Pick<FolderRow, 'id' | 'name' | 'parent_id'>[]): Map<string, string> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const paths = new Map<string, string>();

  const resolve = (folder: Pick<FolderRow, 'id' | 'name' | 'parent_id'>, visiting: Set<string>): string => {
    const cached = paths.get(folder.id);
    if (cached) return cached;
    if (visiting.has(folder.id)) return folder.name;
    visiting.add(folder.id);
    const parent = folder.parent_id ? byId.get(folder.parent_id) : undefined;
    const value = parent ? `${resolve(parent, visiting)}/${folder.name}` : folder.name;
    visiting.delete(folder.id);
    paths.set(folder.id, value);
    return value;
  };

  for (const folder of folders) resolve(folder, new Set());
  return paths;
}

function mapNote(
  row: Pick<NoteRow, 'id' | 'folder_id' | 'name' | 'title' | 'tags' | 'content' | 'revision' | 'updated_at' | 'size'>,
  paths: Map<string, string> = new Map(),
): NoteDocument {
  const parentPath = row.folder_id ? paths.get(row.folder_id) : undefined;
  return {
    id: row.id,
    path: parentPath ? `${parentPath}/${row.name}` : row.name,
    name: row.name,
    folderId: row.folder_id,
    title: row.title,
    tags: row.tags,
    size: row.size ?? Buffer.byteLength(row.content, 'utf8'),
    revision: row.revision,
    updatedAt: Date.parse(row.updated_at),
    content: row.content,
  };
}

function mapSaveRow(row: SaveNoteRow): NoteDocument {
  return mapNote({
    id: row.note_id,
    folder_id: row.folder_id,
    name: row.name,
    title: row.title,
    tags: row.tags,
    content: row.content,
    revision: row.revision,
    updated_at: row.updated_at,
    size: row.size,
  });
}

export class SupabaseCloudNoteStore implements CloudNoteStore {
  async listNotes(context: CloudRequestContext): Promise<NoteMetadata[]> {
    const supabase = createServerSupabaseClient(context.accessToken);
    const [notesResult, foldersResult] = await Promise.all([
      supabase
        .from('notes')
        .select('id, folder_id, name, title, tags, content, revision, updated_at, size')
        .eq('owner_id', context.userId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false }),
      supabase
        .from('folders')
        .select('id, name, parent_id')
        .eq('owner_id', context.userId)
        .is('deleted_at', null),
    ]);
    if (notesResult.error || foldersResult.error) failDatabaseOperation();
    const paths = folderPaths(foldersResult.data);
    return notesResult.data.map((row) => {
      const { content: _, ...metadata } = mapNote(row, paths);
      return metadata;
    });
  }

  async listTree(context: CloudRequestContext): Promise<FileNode[]> {
    const supabase = createServerSupabaseClient(context.accessToken);
    const [foldersResult, notesResult] = await Promise.all([
      supabase
        .from('folders')
        .select('id, name, parent_id')
        .eq('owner_id', context.userId)
        .is('deleted_at', null)
        .order('name'),
      supabase
        .from('notes')
        .select('id, folder_id, name, size, updated_at')
        .eq('owner_id', context.userId)
        .is('deleted_at', null)
        .order('name'),
    ]);
    if (foldersResult.error || notesResult.error) failDatabaseOperation();

    const children = new Map<string | null, FileNode[]>();
    const add = (parentId: string | null, node: FileNode) => {
      const siblings = children.get(parentId) ?? [];
      siblings.push(node);
      children.set(parentId, siblings);
    };
    for (const folder of foldersResult.data) {
      add(folder.parent_id, { name: folder.name, path: folder.id, type: 'directory', children: [] });
    }
    for (const note of notesResult.data) {
      add(note.folder_id, {
        name: note.name,
        path: note.id,
        type: 'file',
        size: note.size ?? 0,
        updatedAt: Date.parse(note.updated_at),
      });
    }

    const attach = (parentId: string | null, visiting: Set<string>): FileNode[] => (children.get(parentId) ?? [])
      .map((node) => {
        if (node.type !== 'directory' || visiting.has(node.path)) return node;
        const nextVisiting = new Set(visiting).add(node.path);
        return { ...node, children: attach(node.path, nextVisiting) };
      })
      .sort((left, right) => left.type === right.type
        ? left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
        : left.type === 'directory' ? -1 : 1);

    return attach(null, new Set());
  }

  async getNote(context: CloudRequestContext, id: string): Promise<NoteDocument> {
    const { data, error } = await createServerSupabaseClient(context.accessToken)
      .from('notes')
      .select('id, folder_id, name, title, tags, content, revision, updated_at, size')
      .eq('owner_id', context.userId)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) failDatabaseOperation();
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'The requested note was not found.');
    return mapNote(data);
  }

  async createNote(context: CloudRequestContext, input: CreateNoteRequest): Promise<NoteDocument> {
    const metadata = parseMarkdownMetadata(input.name, input.content);
    const { data, error } = await createServerSupabaseClient(context.accessToken)
      .from('notes')
      .insert({
        owner_id: context.userId,
        folder_id: input.folderId,
        name: input.name,
        content: input.content,
        title: metadata.title,
        tags: metadata.tags,
        search_text: buildNoteSearchText(input.name, metadata, input.content),
      })
      .select('id, folder_id, name, title, tags, content, revision, updated_at, size')
      .single();
    if (error?.code === '23505') {
      throw new ApiError(409, 'ALREADY_EXISTS', 'A note with that name already exists in this folder.');
    }
    if (error?.code === '23503' || error?.code === '42501') {
      throw new ApiError(400, 'INVALID_REQUEST', 'The selected folder is unavailable.');
    }
    if (error || !data) failDatabaseOperation();
    return mapNote(data);
  }

  async saveNote(context: CloudRequestContext, id: string, input: SaveNoteRequest): Promise<NoteDocument> {
    const current = await this.getNote(context, id);
    const metadata = parseMarkdownMetadata(current.name, input.content);
    const { data, error } = await createServerSupabaseClient(context.accessToken).rpc('save_note', {
      p_id: id,
      p_content: input.content,
      p_expected_revision: input.expectedRevision,
      p_title: metadata.title,
      p_tags: metadata.tags,
      p_search_text: buildNoteSearchText(current.name, metadata, input.content),
    });
    if (error || !data?.[0]) failDatabaseOperation();
    const result = data[0];
    if (result.outcome === 'not_found') {
      throw new ApiError(404, 'NOT_FOUND', 'The requested note was not found.');
    }
    const note = mapSaveRow(result);
    if (result.outcome === 'conflict') {
      throw new ApiError(409, 'REVISION_CONFLICT', 'The note changed after it was opened.', { current: note });
    }
    if (result.outcome !== 'saved') failDatabaseOperation();
    return note;
  }

  async searchNotes(context: CloudRequestContext, query: string, limit: number): Promise<FtsSearchResult[]> {
    if (!query.trim()) return [];
    const { data, error } = await createServerSupabaseClient(context.accessToken).rpc('search_notes', {
      p_query: query,
      p_limit: limit,
    });
    if (error) failDatabaseOperation();
    return data.map((row) => ({
      id: row.note_id,
      title: row.title,
      snippet: row.snippet,
      tags: row.tags,
      rank: row.rank,
    }));
  }

  async listTags(context: CloudRequestContext): Promise<TagCount[]> {
    const { data, error } = await createServerSupabaseClient(context.accessToken)
      .from('notes')
      .select('tags')
      .eq('owner_id', context.userId)
      .is('deleted_at', null);
    if (error) failDatabaseOperation();
    const counts = new Map<string, number>();
    for (const note of data) {
      for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }
}
