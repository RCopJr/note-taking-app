import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface VimKeymap {
  before: string;
  after: string;
  mode: 'normal' | 'insert' | 'visual';
}

export interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  lineNumbers: boolean;
  autosave: boolean;
  autosaveDelayMs: number;
  livePreview: boolean;
}

export interface AppConfig {
  notesDir: string;
  leaderKey: string;
  vimKeymaps: VimKeymap[];
  editor: EditorSettings;
}

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.config', 'notes');
const CONFIG_FILE = path.join(DEFAULT_CONFIG_DIR, 'config.json');
export const DB_FILE = path.join(DEFAULT_CONFIG_DIR, 'index.db');
export const DEFAULT_NOTES_DIR = path.join(os.homedir(), 'notes');

export const DEFAULT_CONFIG: AppConfig = {
  notesDir: DEFAULT_NOTES_DIR,
  leaderKey: '<Space>',
  vimKeymaps: [
    { before: 'jk', after: '<Esc>', mode: 'insert' },
    { before: 'jj', after: '<Esc>', mode: 'insert' },
  ],
  editor: {
    fontSize: 15,
    fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
    lineNumbers: true,
    autosave: true,
    autosaveDelayMs: 500,
    livePreview: true,
  },
};

let cachedConfig: AppConfig | null = null;

export async function ensureNotesDir(dirPath: string): Promise<string> {
  const resolved = path.resolve(dirPath.replace(/^~(?=$|\/|\\)/, os.homedir()));
  await fs.mkdir(resolved, { recursive: true });
  return resolved;
}

export async function loadConfig(cliNotesDir?: string): Promise<AppConfig> {
  await fs.mkdir(DEFAULT_CONFIG_DIR, { recursive: true });

  let config = { ...DEFAULT_CONFIG };
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    config = {
      ...DEFAULT_CONFIG,
      ...parsed,
      editor: {
        ...DEFAULT_CONFIG.editor,
        ...(parsed.editor || {}),
      },
      vimKeymaps: Array.isArray(parsed.vimKeymaps) ? parsed.vimKeymaps : DEFAULT_CONFIG.vimKeymaps,
    };
  } catch {
    // Config file does not exist yet or is invalid, write default
    await fs.writeFile(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
  }

  if (cliNotesDir) {
    config.notesDir = cliNotesDir;
  }

  config.notesDir = await ensureNotesDir(config.notesDir);
  cachedConfig = config;
  return config;
}

export async function saveConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
  const current = cachedConfig || await loadConfig();
  const updated: AppConfig = {
    ...current,
    ...updates,
    editor: {
      ...current.editor,
      ...(updates.editor || {}),
    },
    vimKeymaps: updates.vimKeymaps || current.vimKeymaps,
  };

  if (updates.notesDir) {
    updated.notesDir = await ensureNotesDir(updates.notesDir);
  }

  await fs.mkdir(DEFAULT_CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  cachedConfig = updated;
  return updated;
}

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    throw new Error('Config not loaded yet. Call loadConfig() first.');
  }
  return cachedConfig;
}
