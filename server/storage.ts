import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { parseMarkdownMetadata } from './markdown.ts';
import {
  indexNote,
  deleteNoteFromDb,
  getNoteById,
  getAllNotes,
} from './db.ts';
import type {
  FileNode,
  NoteDocument,
} from '../shared/contracts.ts';


export interface StorageProvider {
  listTree(): Promise<FileNode[]>;
  getNote(id: string): Promise<NoteDocument>;
  saveNote(id: string, content: string): Promise<NoteDocument>;
  deleteNote(id: string): Promise<void>;
  createFolder(folderPath: string): Promise<void>;
  renamePath(oldPath: string, newPath: string): Promise<void>;
  syncAllNotes(): Promise<number>;
}


export class LocalFileStorageProvider implements StorageProvider {
  private notesDir: string;
  private isWatching: boolean = false;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(notesDir: string) {
    this.notesDir = notesDir;
  }

  public setNotesDir(newDir: string): void {
    this.notesDir = newDir;
  }

  private resolvePath(relativePath: string): string {
    const sanitized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    return path.join(this.notesDir, sanitized);
  }

  private getRelativePath(absolutePath: string): string {
    return path.relative(this.notesDir, absolutePath).replace(/\\/g, '/');
  }

  public async listTree(): Promise<FileNode[]> {
    const walk = async (currentDir: string): Promise<FileNode[]> => {
      let entries: Dirent[];
      try {
        entries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        return [];
      }

      const nodes: FileNode[] = [];

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;

        const fullPath = path.join(currentDir, entry.name);
        const relPath = this.getRelativePath(fullPath);

        if (entry.isDirectory()) {
          const children = await walk(fullPath);
          nodes.push({
            name: entry.name,
            path: relPath,
            type: 'directory',
            children,
          });
        } else if (entry.isFile() && /\.(md|txt)$/i.test(entry.name)) {
          const stats = await fs.stat(fullPath);
          nodes.push({
            name: entry.name,
            path: relPath,
            type: 'file',
            size: stats.size,
            updatedAt: stats.mtimeMs,
          });
        }
      }

      // Sort directories first, then alphabetical
      return nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
    };

    return walk(this.notesDir);
  }

  public async getNote(id: string): Promise<NoteDocument> {
    const fullPath = this.resolvePath(id);
    const rawContent = await fs.readFile(fullPath, 'utf-8');
    const stats = await fs.stat(fullPath);
    const { title, tags } = parseMarkdownMetadata(id, rawContent);

    return {
      id,
      path: id,
      name: path.basename(id),
      folderId: null,
      title,
      content: rawContent,
      tags,
      size: stats.size,
      revision: 1,
      updatedAt: stats.mtimeMs,
    };
  }

  public async saveNote(id: string, content: string): Promise<NoteDocument> {
    let normalizedId = id.replace(/\\/g, '/');
    if (!/\.(md|txt)$/i.test(normalizedId)) {
      normalizedId += '.md';
    }

    const fullPath = this.resolvePath(normalizedId);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');

    const stats = await fs.stat(fullPath);
    const { title, tags } = parseMarkdownMetadata(normalizedId, content);

    indexNote(
      normalizedId,
      normalizedId,
      title,
      content,
      tags,
      stats.size,
      stats.mtimeMs
    );

    return {
      id: normalizedId,
      path: normalizedId,
      name: path.basename(normalizedId),
      folderId: null,
      title,
      content,
      tags,
      size: stats.size,
      revision: 1,
      updatedAt: stats.mtimeMs,
    };
  }

  public async deleteNote(id: string): Promise<void> {
    const fullPath = this.resolvePath(id);
    try {
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }
      deleteNoteFromDb(id);
    } catch {
      // File may already be gone
      deleteNoteFromDb(id);
    }
  }

  public async createFolder(folderPath: string): Promise<void> {
    const fullPath = this.resolvePath(folderPath);
    await fs.mkdir(fullPath, { recursive: true });
  }

  public async renamePath(oldPath: string, newPath: string): Promise<void> {
    const oldFull = this.resolvePath(oldPath);
    const newFull = this.resolvePath(newPath);

    await fs.mkdir(path.dirname(newFull), { recursive: true });
    await fs.rename(oldFull, newFull);

    deleteNoteFromDb(oldPath);

    const stats = await fs.stat(newFull);
    if (stats.isFile()) {
      const content = await fs.readFile(newFull, 'utf-8');
      const { title, tags } = parseMarkdownMetadata(newPath, content);
      indexNote(newPath, newPath, title, content, tags, stats.size, stats.mtimeMs);
    } else if (stats.isDirectory()) {
      await this.syncAllNotes();
    }
  }

  public async syncAllNotes(): Promise<number> {
    await fs.mkdir(this.notesDir, { recursive: true });

    const existingIndexed = new Set(getAllNotes().map((n) => n.id));
    const foundOnDisk = new Set<string>();
    let indexedCount = 0;

    const crawl = async (currentDir: string) => {
      let entries: Dirent[];
      try {
        entries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;

        const fullPath = path.join(currentDir, entry.name);
        const relPath = this.getRelativePath(fullPath);

        if (entry.isDirectory()) {
          await crawl(fullPath);
        } else if (entry.isFile() && /\.(md|txt)$/i.test(entry.name)) {
          foundOnDisk.add(relPath);
          const stats = await fs.stat(fullPath);
          const currentMeta = getNoteById(relPath);

          // Re-index if not in DB or mtime changed
          if (!currentMeta || currentMeta.updatedAt !== stats.mtimeMs) {
            const content = await fs.readFile(fullPath, 'utf-8');
            const { title, tags } = parseMarkdownMetadata(relPath, content);
            indexNote(relPath, relPath, title, content, tags, stats.size, stats.mtimeMs);
            indexedCount++;
          }
        }
      }
    };

    await crawl(this.notesDir);

    // Remove deleted files from DB
    for (const indexedId of existingIndexed) {
      if (!foundOnDisk.has(indexedId)) {
        deleteNoteFromDb(indexedId);
      }
    }

    return indexedCount;
  }

  public startWatcher(): void {
    if (this.isWatching) return;
    this.isWatching = true;

    try {
      watch(this.notesDir, { recursive: true }, () => {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.syncAllNotes().catch(() => {});
        }, 300);
      });
    } catch {
      // Watching may not be supported on all filesystem types
    }
  }
}
