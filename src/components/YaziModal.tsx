import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Folder,
  FileText,
  FileCode,
  AlertTriangle,
  X,
} from 'lucide-react';
import type { FileNode } from '../types.ts';
import { fetchNote } from '../api.ts';

export interface YaziModalProps {
  isOpen: boolean;
  tree: FileNode[];
  activeNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onCreateNote: (parentPath?: string) => Promise<void>;
  onCreateFolder: (parentPath?: string) => Promise<void>;
  onDeletePath: (path: string) => Promise<void>;
  onRenamePath: (oldPath: string, newPath: string) => Promise<void>;
  onClose: () => void;
}

// Find a node by path in the tree
function findNodeByPath(nodes: FileNode[], targetPath: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node;
    if (node.children) {
      const found = findNodeByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

// Get parent path from a given path
function getParentPath(itemPath: string): string {
  const parts = itemPath.split('/').filter(Boolean);
  if (parts.length <= 1) return '';
  parts.pop();
  return parts.join('/');
}

export const YaziModal: React.FC<YaziModalProps> = ({
  isOpen,
  tree,
  activeNoteId,
  onSelectNote,
  onCreateNote,
  onCreateFolder,
  onDeletePath,
  onRenamePath,
  onClose,
}) => {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [itemToDelete, setItemToDelete] = useState<FileNode | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState(false);


  const listRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus modal container on open so keyboard navigation works immediately
  useEffect(() => {
    if (isOpen) {
      setShowHelp(false);
      setTimeout(() => {
        modalRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Initialize directory based on active note on open
  useEffect(() => {
    if (isOpen) {
      if (activeNoteId) {
        const parent = getParentPath(activeNoteId);
        setCurrentPath(parent);
      } else {
        setCurrentPath('');
      }
    }
  }, [isOpen, activeNoteId]);

  // Current directory nodes
  const currentItems = useMemo<FileNode[]>(() => {
    if (!currentPath) {
      return tree;
    }
    const node = findNodeByPath(tree, currentPath);
    return node?.children || [];
  }, [tree, currentPath]);

  // Parent directory nodes (for column 1 preview)
  const parentItems = useMemo<FileNode[]>(() => {
    if (!currentPath) {
      return [];
    }
    const parentPath = getParentPath(currentPath);
    if (!parentPath) {
      return tree;
    }
    const node = findNodeByPath(tree, parentPath);
    return node?.children || [];
  }, [tree, currentPath]);

  // Selected item
  const selectedItem = currentItems[selectedIndex] as FileNode | undefined;

  // Sync selected index when directory changes
  useEffect(() => {
    if (currentItems.length > 0) {
      // If the active note is in this folder, select it by default
      if (activeNoteId) {
        const foundIdx = currentItems.findIndex((item) => item.path === activeNoteId);
        if (foundIdx >= 0) {
          setSelectedIndex(foundIdx);
          return;
        }
      }
      setSelectedIndex(0);
    } else {
      setSelectedIndex(0);
    }
  }, [currentPath, currentItems, activeNoteId]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Load preview when highlighted item changes
  useEffect(() => {
    if (!isOpen || !selectedItem) {
      setPreviewContent('');
      return;
    }

    if (selectedItem.type === 'file') {
      setPreviewLoading(true);
      fetchNote(selectedItem.path)
        .then((doc) => {
          setPreviewContent(doc.content);
        })
        .catch(() => {
          setPreviewContent('(Failed to load file preview)');
        })
        .finally(() => {
          setPreviewLoading(false);
        });
    } else {
      setPreviewContent('');
      setPreviewLoading(false);
    }
  }, [isOpen, selectedItem]);

  // Navigation handlers
  const handleMoveDown = useCallback(() => {
    setSelectedIndex((prev) => (prev < currentItems.length - 1 ? prev + 1 : 0));
  }, [currentItems.length]);

  const handleMoveUp = useCallback(() => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, currentItems.length - 1)));
  }, [currentItems.length]);

  const handleEnterOrDescend = useCallback(() => {
    if (!selectedItem) return;

    if (selectedItem.type === 'directory') {
      setCurrentPath(selectedItem.path);
      setSelectedIndex(0);
    } else {
      onSelectNote(selectedItem.path);
      onClose();
    }
  }, [selectedItem, onSelectNote, onClose]);

  const handleAscend = useCallback(() => {
    if (!currentPath) return;
    const parent = getParentPath(currentPath);
    setCurrentPath(parent);
    setSelectedIndex(0);
  }, [currentPath]);

  // Keyboard navigation listener (Yazi style)
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Handle in-app delete confirmation keys
      if (itemToDelete) {
        if (e.key === 'Enter' || e.key === 'y') {
          e.preventDefault();
          const path = itemToDelete.path;
          setItemToDelete(null);
          onDeletePath(path).catch(() => {});
        } else if (e.key === 'Escape' || e.key === 'q' || e.key === 'n') {
          e.preventDefault();
          setItemToDelete(null);
        }
        return;
      }

      // Ignore if an input or dialog is active
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Escape' || e.key === 'q') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleMoveDown();
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        handleMoveUp();
      } else if (e.key === 'l' || e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        handleEnterOrDescend();
      } else if (e.key === 'h' || e.key === 'ArrowLeft' || e.key === '-') {
        e.preventDefault();
        handleAscend();
      } else if (e.key === 'a') {
        e.preventDefault();
        onCreateNote(currentPath || undefined).catch(() => {});
      } else if (e.key === 'A') {
        e.preventDefault();
        onCreateFolder(currentPath || undefined).catch(() => {});
      } else if (e.key === 'd') {
        if (selectedItem) {
          e.preventDefault();
          setItemToDelete(selectedItem);
        }
      } else if (e.key === 'r') {
        if (selectedItem) {
          e.preventDefault();
          const newName = prompt(`Rename "${selectedItem.name}" to:`, selectedItem.name);
          if (newName && newName.trim() && newName !== selectedItem.name) {
            const parent = getParentPath(selectedItem.path);
            const newPath = parent ? `${parent}/${newName.trim()}` : newName.trim();
            onRenamePath(selectedItem.path, newPath).catch(() => {});
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isOpen,
    currentPath,
    selectedItem,
    itemToDelete,
    handleMoveDown,
    handleMoveUp,
    handleEnterOrDescend,
    handleAscend,
    onCreateNote,
    onCreateFolder,
    onDeletePath,
    onRenamePath,
    onClose,
  ]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 sm:p-6 font-sans text-sm text-editor-text select-none"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-5xl h-[78vh] max-h-[calc(100dvh-2rem)] bg-editor-bg border border-editor-border rounded-lg shadow-lg overflow-hidden flex flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-editor-muted relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Breadcrumbs Bar */}
        <div className="min-h-10 shrink-0 bg-editor-sidebar border-b border-editor-border px-4 py-2 flex items-center justify-between gap-3 text-sm">
          <div className="flex min-w-0 items-center space-x-2 truncate">
            {currentPath && (
                <span className="text-editor-text font-mono truncate">{currentPath}</span>
            )}
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowHelp((visible) => !visible)}
              aria-expanded={showHelp}
              aria-label={showHelp ? 'Hide keyboard shortcuts' : 'Show keyboard shortcuts'}
              title={showHelp ? 'Hide keyboard shortcuts' : 'Show keyboard shortcuts'}
              className="flex h-6 w-6 items-center justify-center rounded border border-editor-border font-mono text-sm text-editor-muted transition-colors hover:bg-editor-active hover:text-editor-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-muted"
            >
              ?
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-editor-active text-editor-muted hover:text-editor-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-muted"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* 3-Column Miller Columns Body */}
        <div className="flex-1 min-h-0 flex overflow-x-auto divide-x divide-editor-border">
          {/* Column 1: Parent Directory Preview (22% width) */}
          <div className="w-[22%] min-w-36 shrink-0 bg-editor-sidebar overflow-y-auto p-2 text-sm divide-y divide-transparent">
            <div className="text-xs uppercase text-editor-muted font-semibold px-2 py-1 mb-1 tracking-wider">
              Parent Directory
            </div>
            {parentItems.length > 0 ? (
              parentItems.map((item) => (
                <div
                  key={item.path}
                  onClick={() => {
                    if (item.type === 'directory') {
                      setCurrentPath(item.path);
                      setSelectedIndex(0);
                    }
                  }}
                  className={`flex items-center space-x-2 px-2 py-1 rounded truncate text-sm transition-colors ${
                    item.path === currentPath ? 'bg-editor-active text-editor-text font-semibold' : 'text-editor-muted hover:bg-editor-active hover:text-editor-text'
                  }`}
                >
                  {item.type === 'directory' ? (
                    <Folder size={14} className="text-editor-muted shrink-0" />
                  ) : (
                    <FileText size={14} className="text-editor-muted shrink-0" />
                  )}
                  <span className="truncate">{item.name}</span>
                </div>
              ))
            ) : (
              <div className="px-2 py-4 text-center text-sm text-editor-muted">
                Root of notes
              </div>
            )}
          </div>

          {/* Column 2: Current Directory Active Listing (38% width) */}
          <div
            ref={listRef}
            className="w-[38%] min-w-52 shrink-0 bg-editor-bg overflow-y-auto p-2 text-sm space-y-0.5"
          >
            <div className="text-xs uppercase text-editor-muted font-semibold px-2 py-1 mb-1 tracking-wider flex items-center justify-between gap-2">
              <span className="truncate">{currentPath ? currentPath.split('/').pop() : 'Root'}</span>
              <span className="text-editor-muted font-normal shrink-0">{currentItems.length} items</span>
            </div>

            {currentItems.length > 0 ? (
              currentItems.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const isCurrentActive = item.path === activeNoteId;

                return (
                  <div
                    key={item.path}
                    data-index={idx}
                    onClick={() => {
                      setSelectedIndex(idx);
                      if (item.type === 'file') {
                        onSelectNote(item.path);
                        onClose();
                      } else {
                        setCurrentPath(item.path);
                        setSelectedIndex(0);
                      }
                    }}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-colors text-sm ${
                      isSelected
                        ? 'bg-editor-active text-editor-text font-semibold'
                        : 'hover:bg-editor-sidebar text-editor-text'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className={`w-3 shrink-0 font-mono font-bold text-center ${isSelected ? 'text-editor-accent' : 'text-transparent'}`}>
                        {'>'}
                      </span>
                      {item.type === 'directory' ? (
                        <Folder size={14} className="text-editor-muted shrink-0" />
                      ) : (
                        <FileCode size={14} className={`shrink-0 ${isCurrentActive ? 'text-editor-accent stroke-[2.5]' : 'text-editor-muted'}`} />
                      )}
                      <span className={`truncate ${isCurrentActive ? 'underline underline-offset-2' : ''}`}>{item.name}</span>
                    </div>

                    {item.size !== undefined && (
                      <span className="text-xs text-editor-muted shrink-0 ml-2 font-mono">
                        {item.size > 1024 ? `${(item.size / 1024).toFixed(1)}k` : `${item.size}b`}
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="px-2 py-8 text-center text-sm text-editor-muted space-y-2">
                <div>(Empty folder)</div>
                <div className="text-sm text-editor-muted">Press &quot;a&quot; to create a note here</div>
              </div>
            )}
          </div>

          {/* Column 3: Live Preview Pane (40% width) */}
          <div className="flex-1 min-w-56 bg-editor-bg overflow-hidden flex flex-col">
            <div className="min-h-8 shrink-0 border-b border-editor-border px-3 py-1 flex items-center justify-between gap-2 text-sm bg-editor-sidebar">
              <span className="text-editor-muted truncate">
                {selectedItem ? selectedItem.name : 'Preview'}
              </span>
              {selectedItem?.type === 'file' && (
                <span className="text-xs text-editor-muted shrink-0">Markdown</span>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-3 text-sm">
              {selectedItem?.type === 'directory' ? (
                <div className="space-y-1 text-sm">
                  <div className="text-editor-text font-semibold mb-2">
                    Directory Contents ({selectedItem.children?.length || 0})
                  </div>
                  {selectedItem.children && selectedItem.children.length > 0 ? (
                    selectedItem.children.map((child) => (
                      <div key={child.path} className="flex items-center space-x-2 text-editor-text py-0.5">
                        {child.type === 'directory' ? (
                          <Folder size={14} className="text-editor-muted shrink-0" />
                        ) : (
                          <FileText size={14} className="text-editor-muted shrink-0" />
                        )}
                        <span className="truncate">{child.name}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-editor-muted text-sm italic">Empty directory</div>
                  )}
                </div>
              ) : previewLoading ? (
                <div className="flex items-center justify-center h-32 text-editor-muted">
                  Loading preview...
                </div>
              ) : previewContent ? (
                <pre className="text-sm leading-relaxed text-editor-text whitespace-pre-wrap break-words font-mono">
                  {previewContent}
                </pre>
              ) : (
                <div className="flex items-center justify-center h-32 text-editor-muted text-sm">
                  Select a file to preview
                </div>
              )}
            </div>
          </div>
        </div>

        {showHelp && (
          <div className="shrink-0 bg-editor-sidebar border-t border-editor-border px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs text-editor-muted">
            <div className="flex flex-wrap items-center gap-3">
              <span><kbd className="font-mono bg-editor-bg border border-editor-border px-1.5 py-0.5 rounded text-editor-text">h/l</kbd> parent/open</span>
              <span><kbd className="font-mono bg-editor-bg border border-editor-border px-1.5 py-0.5 rounded text-editor-text">j/k</kbd> up/down</span>
              <span><kbd className="font-mono bg-editor-bg border border-editor-border px-1.5 py-0.5 rounded text-editor-text">Enter</kbd> open</span>
              <span><kbd className="font-mono bg-editor-bg border border-editor-border px-1.5 py-0.5 rounded text-editor-text">a</kbd> new note</span>
              <span><kbd className="font-mono bg-editor-bg border border-editor-border px-1.5 py-0.5 rounded text-editor-text">A</kbd> new folder</span>
              <span><kbd className="font-mono bg-editor-bg border border-editor-border px-1.5 py-0.5 rounded text-editor-text">r</kbd> rename</span>
              <span><kbd className="font-mono bg-editor-bg border border-editor-border px-1.5 py-0.5 rounded text-editor-text">d</kbd> delete</span>
            </div>
            <span><kbd className="font-mono bg-editor-bg border border-editor-border px-1.5 py-0.5 rounded text-editor-text">q / Esc</kbd> close</span>
          </div>
        )}

        {/* In-app Deletion Confirmation Dialog Overlay */}
        {itemToDelete && (
          <div
            className="absolute inset-0 z-50 bg-black/20 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-editor-bg border border-editor-border p-5 rounded-lg shadow-lg max-w-md max-h-full overflow-y-auto w-full space-y-4">
              <div className="flex items-center space-x-2 text-editor-text">
                <AlertTriangle size={20} />
                <h3 className="font-bold text-sm">
                  Delete {itemToDelete.type === 'directory' ? 'Folder' : 'File'}
                </h3>
              </div>
              <p className="text-sm text-editor-text leading-relaxed break-words">
                Are you sure you want to delete {itemToDelete.type}{' '}
                <span className="font-mono font-semibold text-editor-text">&quot;{itemToDelete.name}&quot;</span>
                {itemToDelete.type === 'directory'
                  ? ' and all of its contents? This cannot be undone.'
                  : '?'}
              </p>
              <div className="flex flex-wrap justify-end gap-2 text-sm pt-2">
                <button
                  type="button"
                  onClick={() => setItemToDelete(null)}
                  className="px-3 py-1.5 rounded border border-editor-border bg-editor-bg hover:bg-editor-active text-editor-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-muted focus-visible:ring-offset-2"
                >
                  Cancel (<span className="font-mono text-xs">Esc</span>)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const path = itemToDelete.path;
                    setItemToDelete(null);
                    await onDeletePath(path);
                  }}
                  className="px-3 py-1.5 rounded bg-editor-accent hover:bg-editor-text text-white font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-muted focus-visible:ring-offset-2"
                >
                  Delete (<span className="font-mono text-xs">Enter</span>)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
