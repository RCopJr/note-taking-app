import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers as cmLineNumbers } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import type { VimKeymap } from '../types.ts';
import {
  createVimExtension,
  setupVimKeymaps,
  subscribeVimMode,
  type VimMode,
} from './vim.ts';
import {
  livePreviewPlugin,
  livePreviewCompartment,
} from './livePreview.ts';

export interface EditorProps {
  noteId: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  leaderKey?: string;
  customKeymaps?: VimKeymap[];
  fontSize?: number;
  fontFamily?: string;
  lineNumbers?: boolean;
  livePreview?: boolean;
  autosave?: boolean;
  autosaveDelayMs?: number;
}

export const Editor: React.FC<EditorProps> = ({
  noteId,
  initialContent,
  onSave,
  leaderKey = '<Space>',
  customKeymaps = [],
  fontSize = 15,
  fontFamily = 'JetBrains Mono, Menlo, Monaco, monospace',
  lineNumbers = true,
  livePreview = true,
  autosave = true,
  autosaveDelayMs = 500,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [vimMode, setVimMode] = useState<VimMode>('NORMAL');
  const [saveStatus, setSaveStatus] = useState<string>('Ready');
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number }>({ line: 1, col: 1 });
  const [isLivePreviewActive, setIsLivePreviewActive] = useState<boolean>(livePreview);

  // Setup Vim custom keymaps
  useEffect(() => {
    setupVimKeymaps(leaderKey, customKeymaps);
  }, [leaderKey, customKeymaps]);

  // Subscribe to Vim mode changes
  useEffect(() => {
    const unsubscribe = subscribeVimMode((mode) => {
      setVimMode(mode);
    });
    return unsubscribe;
  }, []);

  const handleManualSave = useCallback(async () => {
    if (!viewRef.current) return;
    const content = viewRef.current.state.doc.toString();
    setSaveStatus('Saving...');
    try {
      await onSave(content);
      const filename = noteId.split('/').pop() || noteId;
      setSaveStatus(`"${filename}" written`);
      setTimeout(() => {
        setSaveStatus('Ready');
      }, 2500);
    } catch {
      setSaveStatus('Error saving');
    }
  }, [noteId, onSave]);

  // Listen to custom window events from Vim ex-commands or shortcuts
  useEffect(() => {
    const onVimSave = () => {
      handleManualSave().catch(() => {});
    };

    const onToggleRaw = () => {
      setIsLivePreviewActive(false);
    };

    const onTogglePreview = () => {
      setIsLivePreviewActive(true);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave().catch(() => {});
      }
    };

    window.addEventListener('notes:save', onVimSave);
    window.addEventListener('notes:toggle-raw', onToggleRaw);
    window.addEventListener('notes:toggle-preview', onTogglePreview);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('notes:save', onVimSave);
      window.removeEventListener('notes:toggle-raw', onToggleRaw);
      window.removeEventListener('notes:toggle-preview', onTogglePreview);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [handleManualSave]);

  // Update Live Preview compartment when state changes
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: livePreviewCompartment.reconfigure(
        isLivePreviewActive ? livePreviewPlugin : []
      ),
    });
  }, [isLivePreviewActive]);

  // Initialize CodeMirror 6 Editor
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy existing view if noteId changes
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.selectionSet) {
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        setCursorPos({
          line: line.number,
          col: head - line.from + 1,
        });
      }

      if (update.docChanged) {
        setSaveStatus('Unsaved');
        if (autosave) {
          if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current);
          }
          autosaveTimerRef.current = setTimeout(() => {
            const currentText = update.state.doc.toString();
            onSave(currentText).then(() => {
              setSaveStatus('Autosaved');
              setTimeout(() => setSaveStatus('Ready'), 1500);
            }).catch(() => {
              setSaveStatus('Autosave failed');
            });
          }, autosaveDelayMs);
        }
      }
    });

    const extensions = [
      createVimExtension(),
      markdown(),
      oneDark,
      updateListener,
      livePreviewCompartment.of(isLivePreviewActive ? livePreviewPlugin : []),
      EditorView.theme({
        '&': {
          fontSize: `${fontSize}px`,
          fontFamily,
        },
      }),
    ];

    if (lineNumbers) {
      extensions.push(cmLineNumbers());
    }

    const state = EditorState.create({
      doc: initialContent,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      view.destroy();
      viewRef.current = null;
    };
  }, [noteId, initialContent, fontSize, fontFamily, lineNumbers, autosave, autosaveDelayMs, isLivePreviewActive, onSave]);

  const modeBadgeColor =
    vimMode === 'INSERT'
      ? 'bg-[#a6e3a1] text-[#11111b]'
      : vimMode === 'VISUAL'
      ? 'bg-[#fab387] text-[#11111b]'
      : vimMode === 'REPLACE'
      ? 'bg-[#f38ba8] text-[#11111b]'
      : 'bg-[#89b4fa] text-[#11111b]';

  return (
    <div className="flex flex-col h-full w-full bg-[#181825] overflow-hidden">
      {/* CodeMirror 6 Editor Container */}
      <div
        ref={containerRef}
        className="flex-1 w-full overflow-auto"
      />

      {/* Neovim-style Statusline */}
      <div className="h-7 bg-[#11111b] border-t border-[#313244] flex items-center justify-between px-3 text-xs select-none font-mono text-[#a6adc8]">
        <div className="flex items-center space-x-3">
          <span className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px] ${modeBadgeColor}`}>
            {vimMode}
          </span>
          <span className="text-[#cdd6f4] font-medium truncate max-w-sm">
            {noteId}
          </span>
          <span className="text-[#585b70]">|</span>
          <span className="text-[#89b4fa]">{saveStatus}</span>
        </div>

        <div className="flex items-center space-x-4">
          <button
            type="button"
            onClick={() => setIsLivePreviewActive(!isLivePreviewActive)}
            className="hover:text-[#cdd6f4] transition-colors cursor-pointer"
            title="Toggle Live Preview vs Raw Markdown"
          >
            Mode: <span className={isLivePreviewActive ? 'text-[#a6e3a1]' : 'text-[#fab387]'}>
              {isLivePreviewActive ? 'Live Preview' : 'Raw Text'}
            </span>
          </button>
          <span className="text-[#585b70]">|</span>
          <span>
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
        </div>
      </div>
    </div>
  );
};
