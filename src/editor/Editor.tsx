import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, drawSelection, keymap } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { indentUnit } from '@codemirror/language';
import { history, indentWithTab } from '@codemirror/commands';
import type { VimKeymap } from '../../shared/contracts.ts';
import {
  createVimExtension,
  setupVimKeymaps,
} from './vim.ts';
import {
  livePreviewPlugin,
  livePreviewCompartment,
} from './livePreview.ts';
import { createBiblePreviewExtension } from './biblePreview.ts';
import { DocumentSaveState } from './documentSaveState.ts';

export interface EditorProps {
  noteId: string;
  noteName: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onResolveConflict?: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  leaderKey?: string;
  customKeymaps?: VimKeymap[];
  fontSize?: number;
  fontFamily?: string;
  lineNumbers?: boolean;
  livePreview?: boolean;
  defaultBibleVersion?: string;
  cursorScrollMarginLines?: number;
}

export interface EditorHandle {
  saveIfDirty: () => Promise<void>;
  isDirty: () => boolean;
}

function cursorScrollMargin(view: EditorView, requestedLines: number) {
  const requestedMargin = requestedLines * view.defaultLineHeight;
  const maximumMargin = Math.max(0, (view.scrollDOM.clientHeight - view.defaultLineHeight) / 2);

  return EditorView.cursorScrollMargin.of({
    x: 5,
    y: Math.min(requestedMargin, maximumMargin),
  });
}


export const Editor = forwardRef<EditorHandle, EditorProps>(({
  noteId,
  noteName,
  initialContent,
  onSave,
  onResolveConflict,
  onDirtyChange,
  leaderKey = '<Space>',
  customKeymaps = [],
  fontSize = 15,
  fontFamily = 'JetBrains Mono, Menlo, Monaco, monospace',
  lineNumbers = true,
  livePreview = true,
  defaultBibleVersion = 'ESV',
  cursorScrollMarginLines = 20,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveStateRef = useRef<DocumentSaveState | null>(null);
  if (!saveStateRef.current) saveStateRef.current = new DocumentSaveState();
  const saveCycleRef = useRef<Promise<void> | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  const [saveStatus, setSaveStatus] = useState<string>('Ready');
  const [isLivePreviewActive, setIsLivePreviewActive] = useState<boolean>(livePreview);

  // Setup Vim custom keymaps and unmap default Space
  useEffect(() => {
    setupVimKeymaps(leaderKey, customKeymaps);
  }, [leaderKey, customKeymaps]);

  const saveIfDirty = useCallback(async () => {
    if (saveCycleRef.current) {
      await saveCycleRef.current;
      return;
    }

    const saveCycle = (async () => {
      while (saveStateRef.current!.isDirty()) {
        const view = viewRef.current;
        if (!view) throw new Error('The editor is not available.');

        const revision = saveStateRef.current!.captureRevision();
        const content = view.state.doc.toString();
        setSaveStatus('Saving…');

        try {
          await onSaveRef.current(content);
        } catch (error) {
          setSaveStatus(
            typeof error === 'object' && error !== null && 'code' in error && error.code === 'REVISION_CONFLICT'
              ? 'Conflict — cloud version changed'
              : 'Save failed — edits remain unsaved',
          );
          throw error;
        }

        saveStateRef.current!.markSaved(revision);
        onDirtyChangeRef.current?.(saveStateRef.current!.isDirty());
      }

      setSaveStatus('Saved');
    })();

    saveCycleRef.current = saveCycle;
    try {
      await saveCycle;
    } finally {
      if (saveCycleRef.current === saveCycle) saveCycleRef.current = null;
    }
  }, [noteId]);

  useImperativeHandle(ref, () => ({
    saveIfDirty,
    isDirty: () => saveStateRef.current!.isDirty(),
  }), [saveIfDirty]);

  // Listen to custom window events from Vim ex-commands or shortcuts
  useEffect(() => {
    const onVimSave = () => {
      saveIfDirty().catch(() => {});
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
        saveIfDirty().catch(() => {});
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
  }, [saveIfDirty]);

  // Update Live Preview compartment when state changes
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: livePreviewCompartment.reconfigure(
        isLivePreviewActive
          ? [livePreviewPlugin, createBiblePreviewExtension(defaultBibleVersion)]
          : []
      ),
    });
  }, [defaultBibleVersion, isLivePreviewActive]);

  // Initialize CodeMirror 6 Editor ONLY when noteId changes or on mount
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy existing view if switching notes
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      saveStateRef.current!.markChanged();
      setSaveStatus('Unsaved');
      onDirtyChangeRef.current?.(true);
    });

    const cursorScrollMarginCompartment = new Compartment();

    const extensions = [
      createVimExtension(),
      EditorView.lineWrapping,
      indentUnit.of('    '),
      EditorState.tabSize.of(4),
      keymap.of([indentWithTab]),
      drawSelection(),
      history(),
      markdown(),
      updateListener,
      cursorScrollMarginCompartment.of(EditorView.cursorScrollMargin.of({ x: 5, y: 5 })),
      livePreviewCompartment.of(
        isLivePreviewActive
          ? [livePreviewPlugin, createBiblePreviewExtension(defaultBibleVersion)]
          : []
      ),
      EditorView.theme({
        '&': {
          fontSize: `${fontSize}px`,
          fontFamily,
        },
      }),
    ];


    onDirtyChangeRef.current?.(false);
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

    const updateCursorScrollMargin = () => {
      view.dispatch({
        effects: cursorScrollMarginCompartment.reconfigure(
          cursorScrollMargin(view, cursorScrollMarginLines)
        ),
      });
    };
    const resizeObserver = new ResizeObserver(updateCursorScrollMargin);
    resizeObserver.observe(view.scrollDOM);
    updateCursorScrollMargin();


    return () => {
      view.destroy();
      resizeObserver.disconnect();
      viewRef.current = null;
    };
    // initialContent is intentionally excluded so save responses do not recreate the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, fontSize, fontFamily, lineNumbers, cursorScrollMarginLines]);


  return (
    <div className="flex flex-col h-full w-full bg-white overflow-hidden">
      {/* CodeMirror 6 Editor Container */}
      <div
        ref={containerRef}
        className="flex-1 w-full overflow-auto"
      />

      {/* Discreet Floating Document & Save Status Pill */}
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-3 left-3 right-3 z-30 flex min-w-0 items-center justify-end gap-2 rounded-full border border-[#e1e4e8] bg-white/95 px-3 py-1 font-mono text-xs shadow-sm backdrop-blur-xs transition-opacity sm:bottom-4 sm:left-auto sm:right-5 sm:max-w-[min(90vw,34rem)] sm:opacity-70 sm:hover:opacity-100"
      >
        <span className="min-w-0 truncate font-semibold text-[#24292e]">
          {noteName}
        </span>
        <span className="shrink-0 text-[#d1d5da]">|</span>
        <span className="min-w-0 truncate font-medium text-editor-muted">
          {saveStatus}
        </span>
        {saveStatus.startsWith('Save failed') && (
          <button
            type="button"
            onClick={() => void saveIfDirty().catch(() => {})}
            className="shrink-0 font-semibold text-[#24292e] underline underline-offset-2"
          >
            Retry
          </button>
        )}
        {saveStatus.startsWith('Conflict') && onResolveConflict && (
          <button
            type="button"
            onClick={() => void onResolveConflict().catch(() => {
              setSaveStatus('Reload failed — local edits preserved');
            })}
            className="shrink-0 font-semibold text-[#24292e] underline underline-offset-2"
          >
            Reload cloud copy
          </button>
        )}
      </div>
    </div>
  );
});
