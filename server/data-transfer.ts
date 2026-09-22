import { strToU8, zipSync, type Zippable } from 'fflate';
import type { Database } from '../shared/database.types.ts';
import type {
  MarkdownImportEntry,
  MarkdownImportFile,
  MarkdownImportReport,
  MarkdownImportRequest,
} from '../shared/contracts.ts';
import { ApiError } from './http.ts';
import { buildNoteSearchText, parseMarkdownMetadata } from './markdown.ts';
import { createServerSupabaseClient, type ServerSupabaseConfig } from './supabase.ts';
import type { CloudRequestContext } from './cloud-notes.ts';

type FolderRow = Pick<Database['public']['Tables']['folders']['Row'], 'id' | 'name' | 'parent_id'>;
type ExportNoteRow = Pick<
  Database['public']['Tables']['notes']['Row'],
  'id' | 'folder_id' | 'name' | 'content' | 'revision' | 'created_at' | 'updated_at'
>;

interface ImportState {
  folders: FolderRow[];
  notes: Array<Pick<ExportNoteRow, 'id' | 'folder_id' | 'name' | 'content'>>;
  imports: Array<Pick<
    Database['public']['Tables']['markdown_imports']['Row'],
    'source_path' | 'source_hash' | 'imported_path' | 'note_id'
  >>;
}

interface PlannedImport {
  sourcePath: string;
  targetPath: string | null;
  sha256: string;
  content: string;
  folderNames: string[];
  name: string;
  status: 'imported' | 'skipped' | 'renamed' | 'failed';
  message?: string;
}

export interface MarkdownArchive {
  bytes: Uint8Array;
  filename: string;
}

export interface DataTransferStore {
  importMarkdown(context: CloudRequestContext, input: MarkdownImportRequest): Promise<MarkdownImportReport>;
  exportMarkdown(context: CloudRequestContext): Promise<MarkdownArchive>;
}

const FIXED_ZIP_TIME = new Date('1980-06-01T00:00:00.000Z');
const EXPORT_MANIFEST_PATH = '_notes-export-manifest.json';
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function folderPathMap(folders: FolderRow[]): Map<string, string> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const paths = new Map<string, string>();
  const resolve = (folder: FolderRow, visiting: Set<string>): string => {
    const cached = paths.get(folder.id);
    if (cached) return cached;
    if (visiting.has(folder.id)) throw new ApiError(500, 'INTERNAL_ERROR', 'The cloud folder hierarchy contains a cycle.');
    visiting.add(folder.id);
    const parent = folder.parent_id ? byId.get(folder.parent_id) : undefined;
    const path = parent ? `${resolve(parent, visiting)}/${folder.name}` : folder.name;
    visiting.delete(folder.id);
    paths.set(folder.id, path);
    return path;
  };
  for (const folder of folders) resolve(folder, new Set());
  return paths;
}

async function sha256(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeImportPath(sourcePath: string): { path: string; segments: string[] } {
  if (sourcePath.startsWith('/') || sourcePath.startsWith('\\') || /^[a-z]:/i.test(sourcePath)) {
    throw new Error('Absolute paths are not allowed.');
  }
  if (sourcePath.includes('\\') || sourcePath.includes('\0')) {
    throw new Error('Backslashes and null bytes are not allowed in import paths.');
  }

  const rawSegments = sourcePath.split('/');
  if (rawSegments.length > 20) throw new Error('Import paths may contain at most 20 segments.');
  const segments = rawSegments.map((segment) => segment.normalize('NFC').trim());
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Import paths cannot contain empty, current-directory, or parent-directory segments.');
  }
  if (segments.some((segment) => segment.length > 255)) {
    throw new Error('Import path segments may contain at most 255 characters.');
  }
  return { path: segments.join('/'), segments };
}

function renamedPath(path: string, occupied: Set<string>): string {
  const slash = path.lastIndexOf('/');
  const directory = slash >= 0 ? path.slice(0, slash + 1) : '';
  const filename = slash >= 0 ? path.slice(slash + 1) : path;
  const extensionMatch = filename.match(/\.(md|txt)$/i);
  const extension = extensionMatch?.[0] ?? '';
  const stem = extension ? filename.slice(0, -extension.length) : filename;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${directory}${stem} (imported ${suffix})${extension}`;
    if (!occupied.has(candidate)) return candidate;
  }
}

function entryFromPlan(plan: PlannedImport): MarkdownImportEntry {
  return {
    sourcePath: plan.sourcePath,
    targetPath: plan.targetPath,
    sha256: plan.sha256,
    ...(plan.message ? { message: plan.message } : {}),
  };
}

function reportFromPlans(plans: PlannedImport[], dryRun: boolean): MarkdownImportReport {
  const report: MarkdownImportReport = {
    dryRun,
    imported: [],
    skipped: [],
    renamed: [],
    failed: [],
  };
  for (const plan of plans) report[plan.status].push(entryFromPlan(plan));
  return report;
}

export async function planMarkdownImport(
  files: MarkdownImportFile[],
  state: ImportState,
): Promise<PlannedImport[]> {
  const folderPaths = folderPathMap(state.folders);
  const activeNotes = new Map(state.notes.map((note) => {
    const parent = note.folder_id ? folderPaths.get(note.folder_id) : undefined;
    return [parent ? `${parent}/${note.name}` : note.name, note] as const;
  }));
  const directoryPaths = new Set(folderPaths.values());
  const occupied = new Set([...activeNotes.keys(), ...directoryPaths]);
  const importedBySource = new Map(state.imports.map((item) => [
    `${item.source_path}\0${item.source_hash}`,
    item,
  ]));
  const activeNoteIds = new Set(state.notes.map((note) => note.id));
  const plans: PlannedImport[] = [];

  for (const file of [...files].sort((left, right) =>
    left.path.localeCompare(right.path) || left.content.localeCompare(right.content)
  )) {
    const hash = await sha256(file.content);
    const base: PlannedImport = {
      sourcePath: file.path,
      targetPath: null,
      sha256: hash,
      content: file.content,
      folderNames: [],
      name: '',
      status: 'failed',
    };

    let normalized: { path: string; segments: string[] };
    try {
      normalized = normalizeImportPath(file.path);
    } catch (error) {
      plans.push({ ...base, message: error instanceof Error ? error.message : 'The import path is invalid.' });
      continue;
    }

    if (!/\.(md|txt)$/i.test(normalized.path)) {
      plans.push({ ...base, status: 'skipped', message: 'Only .md and .txt files are supported.' });
      continue;
    }

    const previousImport = importedBySource.get(`${file.path}\0${hash}`);
    if (previousImport && activeNoteIds.has(previousImport.note_id)) {
      plans.push({
        ...base,
        targetPath: previousImport.imported_path,
        folderNames: previousImport.imported_path.split('/').slice(0, -1),
        name: previousImport.imported_path.split('/').at(-1) ?? '',
        status: 'skipped',
        message: 'This source path and content were already imported.',
      });
      occupied.add(previousImport.imported_path);
      continue;
    }

    const folderNames = normalized.segments.slice(0, -1);
    let parentPath = '';
    let blockedFolder: string | null = null;
    for (const folderName of folderNames) {
      parentPath = parentPath ? `${parentPath}/${folderName}` : folderName;
      if (occupied.has(parentPath) && !directoryPaths.has(parentPath)) {
        blockedFolder = parentPath;
        break;
      }
      directoryPaths.add(parentPath);
      occupied.add(parentPath);
    }
    if (blockedFolder) {
      plans.push({
        ...base,
        targetPath: normalized.path,
        folderNames,
        name: normalized.segments.at(-1) ?? '',
        message: `A note at "${blockedFolder}" blocks the folder hierarchy.`,
      });
      continue;
    }

    let targetPath = normalized.path;
    const exactNote = activeNotes.get(targetPath);
    if (exactNote?.content === file.content) {
      plans.push({
        ...base,
        targetPath,
        folderNames,
        name: normalized.segments.at(-1) ?? '',
        status: 'skipped',
        message: 'An identical active note already exists at this path.',
      });
      continue;
    }

    if (occupied.has(targetPath)) targetPath = renamedPath(targetPath, occupied);
    occupied.add(targetPath);
    const targetSegments = targetPath.split('/');
    const wasRenamed = targetPath !== file.path;
    plans.push({
      ...base,
      targetPath,
      folderNames: targetSegments.slice(0, -1),
      name: targetSegments.at(-1) ?? '',
      status: wasRenamed ? 'renamed' : 'imported',
      ...(wasRenamed ? { message: `Imported as "${targetPath}" to avoid normalization or a naming collision.` } : {}),
    });
  }

  return plans;
}

function safeExportSegment(segment: string): string {
  let safe = segment.normalize('NFC').replace(/[<>:"\\|?*\u0000-\u001f]/g, '_').replace(/[ .]+$/g, '');
  if (!safe) safe = '_';
  if (WINDOWS_RESERVED_NAME.test(safe)) safe = `_${safe}`;
  return safe;
}

export function buildMarkdownArchive(folders: FolderRow[], notes: ExportNoteRow[]): MarkdownArchive {
  const folderPaths = folderPathMap(folders);
  const entries: Zippable = {};
  const manifestNotes: Array<{
    id: string;
    path: string;
    exportPath: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
  }> = [];
  const portablePaths = new Map<string, string>();
  const directoryPaths = new Set<string>();

  const sortedNotes = [...notes].sort((left, right) => {
    const leftParent = left.folder_id ? folderPaths.get(left.folder_id) : undefined;
    const rightParent = right.folder_id ? folderPaths.get(right.folder_id) : undefined;
    return `${leftParent ? `${leftParent}/` : ''}${left.name}`.localeCompare(
      `${rightParent ? `${rightParent}/` : ''}${right.name}`,
    );
  });

  for (const note of sortedNotes) {
    const parentPath = note.folder_id ? folderPaths.get(note.folder_id) : undefined;
    const path = parentPath ? `${parentPath}/${note.name}` : note.name;
    const safeSegments = path.split('/').map(safeExportSegment);
    const lastIndex = safeSegments.length - 1;
    if (!/\.(md|txt)$/i.test(safeSegments[lastIndex])) safeSegments[lastIndex] += '.md';
    const exportPath = safeSegments.join('/');
    const portableKey = exportPath.toLocaleLowerCase('en-US');
    const prior = portablePaths.get(portableKey);
    if (prior) {
      throw new ApiError(409, 'ALREADY_EXISTS', 'The Markdown export contains a portable filename collision.', {
        paths: [prior, path].sort(),
        exportPath,
      });
    }
    if (portableKey === EXPORT_MANIFEST_PATH.toLocaleLowerCase('en-US')) {
      throw new ApiError(409, 'ALREADY_EXISTS', 'A note filename collides with the export manifest.', { path });
    }

    const segments = exportPath.split('/');
    let directory = '';
    for (const segment of segments.slice(0, -1)) {
      directory = directory ? `${directory}/${segment}` : segment;
      const directoryKey = directory.toLocaleLowerCase('en-US');
      if (portablePaths.has(directoryKey)) {
        throw new ApiError(409, 'ALREADY_EXISTS', 'A note filename collides with an exported folder.', {
          paths: [portablePaths.get(directoryKey), path],
          exportPath,
        });
      }
      directoryPaths.add(directoryKey);
    }
    if (directoryPaths.has(portableKey)) {
      throw new ApiError(409, 'ALREADY_EXISTS', 'A folder name collides with an exported note.', { path, exportPath });
    }

    portablePaths.set(portableKey, path);
    entries[exportPath] = [strToU8(note.content), { mtime: FIXED_ZIP_TIME }];
    manifestNotes.push({
      id: note.id,
      path,
      exportPath,
      revision: note.revision,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
    });
  }

  const manifest = `${JSON.stringify({ version: 1, notes: manifestNotes }, null, 2)}\n`;
  entries[EXPORT_MANIFEST_PATH] = [strToU8(manifest), { mtime: FIXED_ZIP_TIME }];
  return {
    bytes: zipSync(entries, { level: 6, mtime: FIXED_ZIP_TIME }),
    filename: 'notes-backup.zip',
  };
}

export class SupabaseDataTransferStore implements DataTransferStore {
  private readonly config: ServerSupabaseConfig;

  constructor(config: ServerSupabaseConfig) {
    this.config = config;
  }

  private async loadImportState(context: CloudRequestContext): Promise<ImportState> {
    const supabase = createServerSupabaseClient(this.config, context.accessToken);
    const [folders, notes, imports] = await Promise.all([
      supabase.from('folders').select('id, name, parent_id').eq('owner_id', context.userId).is('deleted_at', null),
      supabase.from('notes').select('id, folder_id, name, content').eq('owner_id', context.userId).is('deleted_at', null),
      supabase.from('markdown_imports').select('source_path, source_hash, imported_path, note_id').eq('owner_id', context.userId),
    ]);
    if (folders.error || notes.error || imports.error) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'The Markdown import state could not be loaded.');
    }
    return { folders: folders.data, notes: notes.data, imports: imports.data };
  }

  async importMarkdown(context: CloudRequestContext, input: MarkdownImportRequest): Promise<MarkdownImportReport> {
    const plans = await planMarkdownImport(input.files, await this.loadImportState(context));
    if (input.mode === 'dry-run') return reportFromPlans(plans, true);

    const completed: PlannedImport[] = [];
    const supabase = createServerSupabaseClient(this.config, context.accessToken);
    for (const plan of plans) {
      if (plan.status === 'failed' || (plan.status === 'skipped' && plan.targetPath === null)) {
        completed.push(plan);
        continue;
      }
      if (plan.status === 'skipped' && plan.message === 'This source path and content were already imported.') {
        completed.push(plan);
        continue;
      }

      const metadata = parseMarkdownMetadata(plan.name, plan.content);
      const { data, error } = await supabase.rpc('import_markdown_note', {
        p_source_path: plan.sourcePath,
        p_source_hash: plan.sha256,
        p_target_path: plan.targetPath!,
        p_folder_names: plan.folderNames,
        p_name: plan.name,
        p_content: plan.content,
        p_title: metadata.title,
        p_tags: metadata.tags,
        p_search_text: buildNoteSearchText(plan.name, metadata, plan.content),
      });
      if (error || !data?.[0] || !['imported', 'skipped'].includes(data[0].outcome)) {
        completed.push({ ...plan, status: 'failed', message: 'The note could not be imported.' });
        continue;
      }
      if (data[0].outcome === 'skipped') {
        completed.push({ ...plan, status: 'skipped', message: 'An identical note was already imported.' });
      } else {
        completed.push(plan);
      }
    }
    return reportFromPlans(completed, false);
  }

  async exportMarkdown(context: CloudRequestContext): Promise<MarkdownArchive> {
    const supabase = createServerSupabaseClient(this.config, context.accessToken);
    const [folders, notes] = await Promise.all([
      supabase.from('folders').select('id, name, parent_id').eq('owner_id', context.userId).is('deleted_at', null),
      supabase
        .from('notes')
        .select('id, folder_id, name, content, revision, created_at, updated_at')
        .eq('owner_id', context.userId)
        .is('deleted_at', null),
    ]);
    if (folders.error || notes.error) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'The Markdown export could not be created.');
    }
    return buildMarkdownArchive(folders.data, notes.data);
  }
}
