import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, drawSelection, keymap } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { history, indentWithTab } from '@codemirror/commands';
import { getCM } from '@replit/codemirror-vim';
import type { VimKeymap } from '../types.ts';
import {
  createVimExtension,
  setupVimKeymaps,
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

interface VimModeChangeEvent {
  mode: string;
  subMode?: string;
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
  const currentNoteIdRef = useRef<string>(noteId);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const [vimMode, setVimMode] = useState<VimMode>('NORMAL');
  const [subMode, setSubMode] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<string>('Ready');
  const [isLivePreviewActive, setIsLivePreviewActive] = useState<boolean>(livePreview);

  // Setup Vim custom keymaps and unmap default Space
  useEffect(() => {
    setupVimKeymaps(leaderKey, customKeymaps);
  }, [leaderKey, customKeymaps]);

  const handleManualSave = useCallback(async () => {
    if (!viewRef.current) return;
    const content = viewRef.current.state.doc.toString();
    setSaveStatus('Saving...');
    try {
      await onSaveRef.current(content);
      const filename = noteId.split('/').pop() || noteId;
      setSaveStatus(`"${filename}" written`);
      setTimeout(() => {
        setSaveStatus('Ready');
      }, 2500);
    } catch {
      setSaveStatus('Error saving');
    }
  }, [noteId]);

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

    const onFocusEditor = (e: Event) => {
      if (viewRef.current) {
        viewRef.current.focus();

        const customEvt = e as CustomEvent<{ match?: string }>;
        if (customEvt.detail?.match && typeof customEvt.detail.match === 'string') {
          const matchTerm = customEvt.detail.match.trim().toLowerCase();
          if (matchTerm) {
            const text = viewRef.current.state.doc.toString().toLowerCase();
            const idx = text.indexOf(matchTerm);
            if (idx >= 0) {
              viewRef.current.dispatch({
                selection: { anchor: idx, head: idx },
                scrollIntoView: true,
              });
            }
          }
        }
      }
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
    window.addEventListener('notes:focus-editor', onFocusEditor);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('notes:save', onVimSave);
      window.removeEventListener('notes:toggle-raw', onToggleRaw);
      window.removeEventListener('notes:toggle-preview', onTogglePreview);
      window.removeEventListener('notes:focus-editor', onFocusEditor);
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

  // Initialize CodeMirror 6 Editor ONLY when noteId changes or on mount
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy existing view if switching notes
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    currentNoteIdRef.current = noteId;

    const updateListener = EditorView.updateListener.of((update) => {

      if (update.docChanged) {
        setSaveStatus('Unsaved');
        if (autosave) {
          if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current);
          }
          autosaveTimerRef.current = setTimeout(() => {
            if (!viewRef.current) return;
            const currentText = viewRef.current.state.doc.toString();
            onSaveRef.current(currentText).then(() => {
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
      EditorView.lineWrapping,
      keymap.of([indentWithTab]),
      drawSelection(),
      history(),
      markdown(),
      updateListener,
      livePreviewCompartment.of(isLivePreviewActive ? livePreviewPlugin : []),
      EditorView.theme({
        '&': {
          fontSize: `${fontSize}px`,
          fontFamily,
        },
      }),
    ];


    const state = EditorState.create({
      doc: initialContent,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    view.focus();

    // Hook into Vim adapter mode changes
    try {
      const cm = getCM(view);
      if (cm && typeof cm.on === 'function') {
        cm.on('vim-mode-change', (data: VimModeChangeEvent) => {
          const rawMode = (data.mode || 'normal').toUpperCase();
          if (rawMode === 'INSERT') setVimMode('INSERT');
          else if (rawMode === 'VISUAL') setVimMode('VISUAL');
          else if (rawMode === 'REPLACE') setVimMode('REPLACE');
          else setVimMode('NORMAL');

          setSubMode(data.subMode ? data.subMode.toUpperCase() : '');
        });
      }
    } catch {
      // Ignore if adapter unavailable
    }

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      view.destroy();
      viewRef.current = null;
    };
    // Note: initialContent is intentionally NOT in dependency array so autosaves do not recreate the editor!
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, fontSize, fontFamily, lineNumbers, autosave, autosaveDelayMs]);

  const modeBadgeColor =
    vimMode === 'INSERT'
      ? 'bg-[#24292e] text-white'
      : vimMode === 'VISUAL'
      ? 'bg-[#586069] text-white'
      : vimMode === 'REPLACE'
      ? 'bg-[#24292e] text-white'
      : 'bg-[#24292e] text-white';

  return (
    <div className="flex flex-col h-full w-full bg-white overflow-hidden">
      {/* CodeMirror 6 Editor Container */}
      <div
        ref={containerRef}
        className="flex-1 w-full overflow-auto"
      />

      {/* Neovim-style Statusline (Typora light style) */}
      <div className="h-7 bg-[#f6f8fa] border-t border-[#e1e4e8] flex items-center justify-between px-3 text-xs select-none font-mono text-[#586069]">
        <div className="flex items-center space-x-3">
          <span className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px] ${modeBadgeColor}`}>
            {vimMode} {subMode ? `(${subMode})` : ''}
          </span>
          <span className="text-[#24292e] font-semibold truncate max-w-sm">
            {noteId}
          </span>
          <span className="text-[#d1d5da]">|</span>
          <span className="text-[#0366d6] font-medium">{saveStatus}</span>
        </div>

        <div className="flex items-center space-x-4">
          <button
            type="button"
            onClick={() => setIsLivePreviewActive(!isLivePreviewActive)}
            className="hover:text-[#24292e] transition-colors cursor-pointer"
            title="Toggle Live Preview vs Raw Markdown"
          >
            Mode: <span className={isLivePreviewActive ? 'text-[#2ea44f] font-semibold' : 'text-[#d73a49] font-semibold'}>
              {isLivePreviewActive ? 'Live Preview' : 'Raw Text'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
