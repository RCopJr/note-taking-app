import { Vim, vim } from '@replit/codemirror-vim';
import type { Extension } from '@codemirror/state';
import type { VimKeymap } from '../types.ts';

export type VimMode = 'NORMAL' | 'INSERT' | 'VISUAL' | 'REPLACE';

type ModeChangeCallback = (mode: VimMode) => void;
const modeListeners = new Set<ModeChangeCallback>();

function dispatchVimEvent(eventName: string): void {
  const evt = new CustomEvent(eventName);
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(evt);
  } else if (typeof globalThis !== 'undefined' && 'dispatchEvent' in globalThis) {
    const gt = globalThis as { dispatchEvent?: (e: Event) => boolean };
    if (typeof gt.dispatchEvent === 'function') {
      gt.dispatchEvent(evt);
    }
  }
}

let commandsRegistered = false;

export function registerVimCommands(): void {
  if (commandsRegistered) return;
  commandsRegistered = true;

  // :w (Save)
  Vim.defineEx('w', 'w', () => {
    dispatchVimEvent('notes:save');
  });

  // :write
  Vim.defineEx('write', 'write', () => {
    dispatchVimEvent('notes:save');
  });

  // :copy / :gdoc (Export to Google Docs)
  Vim.defineEx('gdoc', 'gdoc', () => {
    dispatchVimEvent('notes:export-gdoc');
  });
  Vim.defineEx('copy', 'copy', () => {
    dispatchVimEvent('notes:export-gdoc');
  });

  // :raw / :preview (Toggle Live Preview)
  Vim.defineEx('raw', 'raw', () => {
    dispatchVimEvent('notes:toggle-raw');
  });
  Vim.defineEx('preview', 'preview', () => {
    dispatchVimEvent('notes:toggle-preview');
  });

  // Ex-commands
  Vim.defineEx('findfiles', 'findfiles', () => {
    dispatchVimEvent('notes:find-files');
  });
  Vim.defineEx('livegrep', 'livegrep', () => {
    dispatchVimEvent('notes:live-grep');
  });
  Vim.defineEx('sidebar', 'sidebar', () => {
    dispatchVimEvent('notes:toggle-sidebar');
  });
  Vim.defineEx('cheatsheet', 'cheatsheet', () => {
    dispatchVimEvent('notes:open-cheatsheet');
  });

  // Native Vim actions (dispatched directly on key combos without opening an ex prompt)
  Vim.defineAction('notesFindFiles', () => {
    dispatchVimEvent('notes:find-files');
  });
  Vim.defineAction('notesLiveGrep', () => {
    dispatchVimEvent('notes:live-grep');
  });
  Vim.defineAction('notesExportGdoc', () => {
    dispatchVimEvent('notes:export-gdoc');
  });
  Vim.defineAction('notesToggleSidebar', () => {
    dispatchVimEvent('notes:toggle-sidebar');
  });
  Vim.defineAction('notesCheatsheet', () => {
    dispatchVimEvent('notes:open-cheatsheet');
  });
  Vim.defineAction('notesToggleRaw', () => {
    dispatchVimEvent('notes:toggle-raw');
  });
}

export function setupVimKeymaps(leaderKey: string = '<Space>', customMaps: VimKeymap[] = []): void {
  registerVimCommands();

  // Normalize leader key representation
  const leader = leaderKey === ' ' ? '<Space>' : leaderKey;

  // Unmap default space behavior so it buffers as a leader key instead of moving right
  if (leader === '<Space>') {
    try {
      Vim.unmap('<Space>', undefined as unknown as string);
    } catch {
      // Ignore if not present
    }
  }

  // Built-in Telescope & Action Leader mappings in Normal mode using native actions
  Vim.mapCommand(`${leader}ff`, 'action', 'notesFindFiles', {}, { context: 'normal' });
  Vim.mapCommand(`${leader}fw`, 'action', 'notesLiveGrep', {}, { context: 'normal' });
  Vim.mapCommand(`${leader}g`, 'action', 'notesExportGdoc', {}, { context: 'normal' });
  Vim.mapCommand(`${leader}e`, 'action', 'notesToggleSidebar', {}, { context: 'normal' });
  Vim.mapCommand(`${leader}?`, 'action', 'notesCheatsheet', {}, { context: 'normal' });
  Vim.mapCommand(`${leader}tr`, 'action', 'notesToggleRaw', {}, { context: 'normal' });

  // Register user custom keymaps
  for (const km of customMaps) {
    if (km.before && km.after && km.mode) {
      Vim.map(km.before, km.after, km.mode);
    }
  }
}

export function subscribeVimMode(callback: ModeChangeCallback): () => void {
  modeListeners.add(callback);
  return () => {
    modeListeners.delete(callback);
  };
}

export function notifyVimModeChange(mode: VimMode): void {
  for (const listener of modeListeners) {
    listener(mode);
  }
}

export function createVimExtension(): Extension {
  return vim({ status: false });
}
