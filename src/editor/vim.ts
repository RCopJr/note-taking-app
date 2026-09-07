import { Vim, vim } from '@replit/codemirror-vim';
import { RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import type { VimKeymap } from '../types.ts';

export type VimMode = 'NORMAL' | 'INSERT' | 'VISUAL' | 'REPLACE';

type ModeChangeCallback = (mode: VimMode) => void;
const modeListeners = new Set<ModeChangeCallback>();

interface YankRange {
  from: number;
  to: number;
}

const showYankHighlight = StateEffect.define<readonly YankRange[]>();
const clearYankHighlight = StateEffect.define();

const yankHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(clearYankHighlight)) return Decoration.none;
      if (effect.is(showYankHighlight)) {
        const builder = new RangeSetBuilder<Decoration>();
        for (const { from, to } of effect.value) {
          builder.add(from, to, Decoration.mark({ class: 'cm-vim-yank-highlight' }));
        }
        return builder.finish();
      }
    }
    return decorations.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

function highlightYankedRanges(view: EditorView, ranges: readonly YankRange[]): void {
  if (ranges.length === 0) return;

  view.dispatch({ effects: showYankHighlight.of(ranges) });
  window.setTimeout(() => {
    if (!view.dom.isConnected) return;
    view.dispatch({ effects: clearYankHighlight.of(null) });
  }, 500);
}

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

  Vim.defineEx('explore', 'explore', () => {
    dispatchVimEvent('notes:open-explorer');
  });
  Vim.defineEx('yazi', 'yazi', () => {
    dispatchVimEvent('notes:open-explorer');
  });
  Vim.defineEx('set', 'set', () => {
    dispatchVimEvent('notes:open-settings');
  });
  Vim.defineEx('settings', 'settings', () => {
    dispatchVimEvent('notes:open-settings');
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
  Vim.defineAction('notesOpenSettings', () => {
    dispatchVimEvent('notes:open-settings');
  });
  Vim.defineOperator('yank', (cm, args, ranges, oldAnchor) => {
    const vimState = cm.state.vim;
    const yankRanges = cm.listSelections()
      .map(({ anchor, head }) => {
        const from = cm.indexFromPos(anchor);
        const to = cm.indexFromPos(head);
        return from < to ? { from, to } : null;
      })
      .filter((range): range is YankRange => range !== null);

    Vim.getRegisterController().pushText(
      args.registerName,
      'yank',
      cm.getSelection(),
      args.linewise,
      Boolean(vimState?.visualBlock)
    );
    highlightYankedRanges(cm.cm6 as EditorView, yankRanges);

    if (!vimState?.visualMode) return oldAnchor;
    return ranges[0].anchor.line < ranges[0].head.line
      || (ranges[0].anchor.line === ranges[0].head.line
        && ranges[0].anchor.ch <= ranges[0].head.ch)
      ? ranges[0].anchor
      : ranges[0].head;
  });

}

  Vim.defineAction('notesExplore', () => {
    dispatchVimEvent('notes:open-explorer');
  });
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

  Vim.mapCommand(`${leader}-`, 'action', 'notesExplore', {}, { context: 'normal' });
  Vim.mapCommand(`${leader}e`, 'action', 'notesExplore', {}, { context: 'normal' });
  Vim.mapCommand(`${leader}ff`, 'action', 'notesFindFiles', {}, { context: 'normal' });
  Vim.mapCommand(`${leader}fw`, 'action', 'notesLiveGrep', {}, { context: 'normal' });
  Vim.mapCommand(`${leader}g`, 'action', 'notesExportGdoc', {}, { context: 'normal' });
  Vim.mapCommand(`${leader}?`, 'action', 'notesCheatsheet', {}, { context: 'normal' });
  Vim.mapCommand(`${leader}tr`, 'action', 'notesToggleRaw', {}, { context: 'normal' });

  Vim.mapCommand(`${leader},`, 'action', 'notesOpenSettings', {}, { context: 'normal' });
  Vim.mapCommand(`${leader}s`, 'action', 'notesOpenSettings', {}, { context: 'normal' });
  // Swap j/k (visual screen lines) and gj/gk (buffer logical lines) for wrapped prose
  Vim.noremap('j', 'gj', 'normal');
  Vim.noremap('k', 'gk', 'normal');
  Vim.noremap('gj', 'j', 'normal');
  Vim.noremap('gk', 'k', 'normal');
  Vim.noremap('j', 'gj', 'visual');
  Vim.noremap('k', 'gk', 'visual');
  Vim.noremap('gj', 'j', 'visual');
  Vim.noremap('gk', 'k', 'visual');

  // Built-in escape keymaps
  Vim.map('jk', '<Esc>', 'insert');
  Vim.map('jj', '<Esc>', 'insert');
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
  return [vim({ status: false }), yankHighlightField];
}
