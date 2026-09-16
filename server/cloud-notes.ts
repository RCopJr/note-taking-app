import type { Database } from '../shared/database.types.ts';
import type {
  CreateFolderRequest,
  CreateNoteRequest,
  DeletedNode,
  FileNode,
  FolderMetadata,
  FtsSearchResult,
  NoteDocument,
  NoteMetadata,
  RevisionMutationRequest,
  SaveNoteRequest,
  TagCount,
  UpdateFolderRequest,
  UpdateNoteMetadataRequest,
} from '../shared/contracts.ts';
import { ApiError } from './http.ts';
import { buildNoteSearchText, parseMarkdownMetadata } from './markdown.ts';
import { createServerSupabaseClient } from './supabase.ts';

type FolderRow = Database['public']['Tables']['folders']['Row'];
type NoteRow = Database['public']['Tables']['notes']['Row'];
type NoteMutationRow = Database['public']['Functions']['save_note']['Returns'][number];

export interface CloudRequestContext {
  accessToken: string;
  userId: string;
}

export interface CloudNoteStore {
  listNotes(context: CloudRequestContext): Promise<NoteMetadata[]>;
  listTree(context: CloudRequestContext): Promise<FileNode[]>;
  listDeleted(context: CloudRequestContext): Promise<DeletedNode[]>;
  getNote(context: CloudRequestContext, id: string): Promise<NoteDocument>;
  createNote(context: CloudRequestContext, input: CreateNoteRequest): Promise<NoteDocument>;
  saveNote(context: CloudRequestContext, id: string, input: SaveNoteRequest): Promise<NoteDocument>;
  updateNote(context: CloudRequestContext, id: string, input: UpdateNoteMetadataRequest): Promise<NoteDocument>;
  deleteNote(context: CloudRequestContext, id: string, input: RevisionMutationRequest): Promise<void>;
  restoreNote(context: CloudRequestContext, id: string, input: RevisionMutationRequest): Promise<NoteDocument>;
  createFolder(context: CloudRequestContext, input: CreateFolderRequest): Promise<FolderMetadata>;
  updateFolder(context: CloudRequestContext, id: string, input: UpdateFolderRequest): Promise<FolderMetadata>;
  deleteFolder(context: CloudRequestContext, id: string): Promise<void>;
  restoreFolder(context: CloudRequestContext, id: string): Promise<void>;
  searchNotes(context: CloudRequestContext, query: string, limit: number): Promise<FtsSearchResult[]>;
  listTags(context: CloudRequestContext): Promise<TagCount[]>;
}

function failDatabaseOperation(): never {
  throw new ApiError(500, 'INTERNAL_ERROR', 'The cloud note operation could not be completed.');
}

function throwMutationError(error: { code?: string } | null, duplicateMessage: string): never {
  if (error?.code === '23505') {
    throw new ApiError(409, 'ALREADY_EXISTS', duplicateMessage);
  }
  if (error?.code === '23503' || error?.code === '23514' || error?.code === '42501') {
    throw new ApiError(400, 'INVALID_REQUEST', 'The selected folder is unavailable or would create an invalid hierarchy.');
  }
  failDatabaseOperation();
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

function mapFolder(row: Pick<FolderRow, 'id' | 'parent_id' | 'name' | 'updated_at'>): FolderMetadata {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    updatedAt: Date.parse(row.updated_at),
  };
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

export class SupabaseCloudNoteStore implements CloudNoteStore {
  private async loadFolderPaths(context: CloudRequestContext): Promise<Map<string, string>> {
    const { data, error } = await createServerSupabaseClient(context.accessToken)
      .from('folders')
      .select('id, name, parent_id')
      .eq('owner_id', context.userId)
      .is('deleted_at', null);
    if (error) failDatabaseOperation();
    return folderPaths(data);
  }

  private async mapMutation(
    context: CloudRequestContext,
    data: NoteMutationRow[] | null,
    error: { code?: string } | null,
    duplicateMessage: string,
  ): Promise<NoteDocument> {
    if (error) throwMutationError(error, duplicateMessage);
    if (!data?.[0]) failDatabaseOperation();
    const result = data[0];
    if (result.outcome === 'not_found') {
      throw new ApiError(404, 'NOT_FOUND', 'The requested note was not found.');
    }
    const note = mapNote({
      id: result.note_id,
      folder_id: result.folder_id,
      name: result.name,
      title: result.title,
      tags: result.tags,
      content: result.content,
      revision: result.revision,
      updated_at: result.updated_at,
      size: result.size,
    }, await this.loadFolderPaths(context));
    if (result.outcome === 'conflict') {
      throw new ApiError(409, 'REVISION_CONFLICT', 'The note changed after it was opened.', { current: note });
    }
    if (result.outcome !== 'saved') failDatabaseOperation();
    return note;
  }

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
        .select('id, name, parent_id, updated_at')
        .eq('owner_id', context.userId)
        .is('deleted_at', null)
        .order('name'),
      supabase
        .from('notes')
        .select('id, folder_id, name, size, revision, updated_at')
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
      add(folder.parent_id, {
        name: folder.name,
        id: folder.id,
        parentId: folder.parent_id,
        type: 'directory',
        updatedAt: Date.parse(folder.updated_at),
        children: [],
      });
    }
    for (const note of notesResult.data) {
      add(note.folder_id, {
        name: note.name,
        id: note.id,
        parentId: note.folder_id,
        type: 'file',
        size: note.size ?? 0,
        revision: note.revision,
        updatedAt: Date.parse(note.updated_at),
      });
    }

    const attach = (parentId: string | null, visiting: Set<string>): FileNode[] => (children.get(parentId) ?? [])
      .map((node) => {
        if (node.type !== 'directory' || visiting.has(node.id)) return node;
        const nextVisiting = new Set(visiting).add(node.id);
        return { ...node, children: attach(node.id, nextVisiting) };
      })
      .sort((left, right) => left.type === right.type
        ? left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
        : left.type === 'directory' ? -1 : 1);

    return attach(null, new Set());
  }

  async listDeleted(context: CloudRequestContext): Promise<DeletedNode[]> {
    const supabase = createServerSupabaseClient(context.accessToken);
    const [foldersResult, notesResult] = await Promise.all([
      supabase
        .from('folders')
        .select('id, parent_id, name, deleted_at')
        .eq('owner_id', context.userId)
        .not('deleted_at', 'is', null),
      supabase
        .from('notes')
        .select('id, folder_id, name, revision, deleted_at')
        .eq('owner_id', context.userId)
        .not('deleted_at', 'is', null),
    ]);
    if (foldersResult.error || notesResult.error) failDatabaseOperation();
    const deletedFolders = new Map(foldersResult.data.map((folder) => [folder.id, folder]));
    const roots: DeletedNode[] = [];
    for (const folder of foldersResult.data) {
      const parent = folder.parent_id ? deletedFolders.get(folder.parent_id) : undefined;
      if (!parent || parent.deleted_at !== folder.deleted_at) {
        roots.push({
          id: folder.id,
          type: 'directory',
          name: folder.name,
          deletedAt: Date.parse(folder.deleted_at!),
        });
      }
    }
    for (const note of notesResult.data) {
      const folder = note.folder_id ? deletedFolders.get(note.folder_id) : undefined;
      if (!folder || folder.deleted_at !== note.deleted_at) {
        roots.push({
          id: note.id,
          type: 'file',
          name: note.name,
          revision: note.revision,
          deletedAt: Date.parse(note.deleted_at!),
        });
      }
    }
    return roots.sort((left, right) => right.deletedAt - left.deletedAt);
  }

  async getNote(context: CloudRequestContext, id: string): Promise<NoteDocument> {
    const supabase = createServerSupabaseClient(context.accessToken);
    const [noteResult, paths] = await Promise.all([
      supabase
        .from('notes')
        .select('id, folder_id, name, title, tags, content, revision, updated_at, size')
        .eq('owner_id', context.userId)
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle(),
      this.loadFolderPaths(context),
    ]);
    if (noteResult.error) failDatabaseOperation();
    if (!noteResult.data) throw new ApiError(404, 'NOT_FOUND', 'The requested note was not found.');
    return mapNote(noteResult.data, paths);
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
    if (error) throwMutationError(error, 'A note with that name already exists in this folder.');
    if (!data) failDatabaseOperation();
    return mapNote(data, await this.loadFolderPaths(context));
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
    return this.mapMutation(context, data, error, 'A note with that name already exists in this folder.');
  }

  async updateNote(context: CloudRequestContext, id: string, input: UpdateNoteMetadataRequest): Promise<NoteDocument> {
    const current = await this.getNote(context, id);
    const metadata = parseMarkdownMetadata(input.name, current.content);
    const { data, error } = await createServerSupabaseClient(context.accessToken).rpc('update_note_metadata', {
      p_id: id,
      p_name: input.name,
      // PostgreSQL accepts null here to move to root; generated RPC args omit parameter nullability.
      p_folder_id: input.folderId!,
      p_expected_revision: input.expectedRevision,
      p_search_text: buildNoteSearchText(input.name, metadata, current.content),
    });
    return this.mapMutation(context, data, error, 'A note with that name already exists in this folder.');
  }

  async deleteNote(context: CloudRequestContext, id: string, input: RevisionMutationRequest): Promise<void> {
    const { data, error } = await createServerSupabaseClient(context.accessToken).rpc('set_note_deleted', {
      p_id: id,
      p_expected_revision: input.expectedRevision,
      p_deleted: true,
    });
    await this.mapMutation(context, data, error, 'A note with that name already exists in this folder.');
  }

  async restoreNote(context: CloudRequestContext, id: string, input: RevisionMutationRequest): Promise<NoteDocument> {
    const { data, error } = await createServerSupabaseClient(context.accessToken).rpc('set_note_deleted', {
      p_id: id,
      p_expected_revision: input.expectedRevision,
      p_deleted: false,
    });
    return this.mapMutation(context, data, error, 'A note with that name already exists in this folder.');
  }

  async createFolder(context: CloudRequestContext, input: CreateFolderRequest): Promise<FolderMetadata> {
    const { data, error } = await createServerSupabaseClient(context.accessToken)
      .from('folders')
      .insert({ owner_id: context.userId, name: input.name, parent_id: input.parentId })
      .select('id, parent_id, name, updated_at')
      .single();
    if (error) throwMutationError(error, 'A folder with that name already exists in this folder.');
    if (!data) failDatabaseOperation();
    return mapFolder(data);
  }

  async updateFolder(context: CloudRequestContext, id: string, input: UpdateFolderRequest): Promise<FolderMetadata> {
    const { data, error } = await createServerSupabaseClient(context.accessToken)
      .from('folders')
      .update({ name: input.name, parent_id: input.parentId })
      .eq('owner_id', context.userId)
      .eq('id', id)
      .is('deleted_at', null)
      .select('id, parent_id, name, updated_at')
      .maybeSingle();
    if (error) throwMutationError(error, 'A folder with that name already exists in this folder.');
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'The requested folder was not found.');
    return mapFolder(data);
  }

  async deleteFolder(context: CloudRequestContext, id: string): Promise<void> {
    const { data, error } = await createServerSupabaseClient(context.accessToken).rpc('set_folder_deleted', {
      p_id: id,
      p_deleted: true,
    });
    if (error) throwMutationError(error, 'A folder with that name already exists in this folder.');
    if (data === 'not_found') throw new ApiError(404, 'NOT_FOUND', 'The requested folder was not found.');
    if (data !== 'saved') failDatabaseOperation();
  }

  async restoreFolder(context: CloudRequestContext, id: string): Promise<void> {
    const { data, error } = await createServerSupabaseClient(context.accessToken).rpc('set_folder_deleted', {
      p_id: id,
      p_deleted: false,
    });
    if (error) throwMutationError(error, 'A folder with that name already exists in this folder.');
    if (data === 'not_found') throw new ApiError(404, 'NOT_FOUND', 'The requested folder was not found.');
    if (data === 'conflict') {
      throw new ApiError(409, 'ALREADY_EXISTS', 'Restore failed because an active item now uses the same name.');
    }
    if (data !== 'saved') failDatabaseOperation();
  }

  async searchNotes(context: CloudRequestContext, query: string, limit: number): Promise<FtsSearchResult[]> {
    if (!query.trim()) return [];
    const supabase = createServerSupabaseClient(context.accessToken);
    const [searchResult, paths] = await Promise.all([
      supabase.rpc('search_notes', { p_query: query, p_limit: limit }),
      this.loadFolderPaths(context),
    ]);
    if (searchResult.error) failDatabaseOperation();
    return searchResult.data.map((row) => {
      const parentPath = row.folder_id ? paths.get(row.folder_id) : undefined;
      return {
        id: row.note_id,
        path: parentPath ? `${parentPath}/${row.note_name}` : row.note_name,
        title: row.title,
        snippet: row.snippet,
        tags: row.tags,
        rank: row.rank,
      };
    });
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
