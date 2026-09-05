import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Folder,
  FileText,
  FileCode,
  CornerLeftUp,
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
  const [previewContent, setPreviewContent] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  const listRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus modal container on open so keyboard navigation works immediately
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        modalRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);
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
          if (confirm(`Delete ${selectedItem.type} "${selectedItem.name}"?`)) {
            onDeletePath(selectedItem.path).catch(() => {});
          }
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-6 font-mono select-none"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-5xl h-[78vh] bg-[#181825] border border-[#313244] rounded-xl shadow-2xl overflow-hidden flex flex-col focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Breadcrumbs Bar */}
        <div className="h-10 bg-[#1e1e2e] border-b border-[#313244] px-4 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 truncate">
            <span className="font-bold text-[#89b4fa]">YAZI EXPLORER</span>
            <span className="text-[#585b70]">/</span>
            <span className="text-[#fab387] font-semibold">~/notes</span>
            {currentPath && (
              <>
                <span className="text-[#585b70]">/</span>
                <span className="text-[#cdd6f4] font-medium truncate">{currentPath}</span>
              </>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {currentPath && (
              <button
                type="button"
                onClick={handleAscend}
                className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-[#313244] text-[#a6adc8] hover:text-[#cdd6f4] transition-colors cursor-pointer text-[11px]"
                title="Go up to parent directory (- or h)"
              >
                <CornerLeftUp size={12} />
                <span>..</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#cdd6f4] transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* 3-Column Miller Columns Body */}
        <div className="flex-1 flex overflow-hidden divide-x divide-[#313244]/60">
          {/* Column 1: Parent Directory Preview (22% width) */}
          <div className="w-[22%] bg-[#11111b]/40 overflow-y-auto p-2 text-xs divide-y divide-transparent">
            <div className="text-[10px] uppercase text-[#585b70] font-semibold px-2 py-1 mb-1 tracking-wider">
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
                  className={`flex items-center space-x-2 px-2 py-1 rounded truncate opacity-60 text-[11px] ${
                    item.path === currentPath ? 'bg-[#313244]/50 opacity-100 text-[#89b4fa] font-bold' : 'hover:opacity-90'
                  }`}
                >
                  {item.type === 'directory' ? (
                    <Folder size={12} className="text-[#89b4fa] shrink-0" />
                  ) : (
                    <FileText size={12} className="text-[#6c7086] shrink-0" />
                  )}
                  <span className="truncate">{item.name}</span>
                </div>
              ))
            ) : (
              <div className="px-2 py-4 text-center text-[11px] text-[#585b70]">
                Root of notes
              </div>
            )}
          </div>

          {/* Column 2: Current Directory Active Listing (38% width) */}
          <div
            ref={listRef}
            className="w-[38%] bg-[#181825] overflow-y-auto p-2 text-xs space-y-0.5"
          >
            <div className="text-[10px] uppercase text-[#89b4fa] font-semibold px-2 py-1 mb-1 tracking-wider flex items-center justify-between">
              <span>{currentPath ? currentPath.split('/').pop() : 'Root'}</span>
              <span className="text-[#585b70] font-normal">{currentItems.length} items</span>
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
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-colors text-xs ${
                      isSelected
                        ? 'bg-[#313244] text-[#cdd6f4] font-semibold'
                        : 'hover:bg-[#1e1e2e] text-[#a6adc8]'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className={`w-3 font-bold text-center ${isSelected ? 'text-[#89b4fa]' : 'text-transparent'}`}>
                        {'>'}
                      </span>
                      {item.type === 'directory' ? (
                        <Folder size={14} className="text-[#89b4fa] shrink-0" />
                      ) : (
                        <FileCode size={14} className={isCurrentActive ? 'text-[#a6e3a1]' : 'text-[#a6adc8] shrink-0'} />
                      )}
                      <span className="truncate">{item.name}</span>
                    </div>

                    {item.size !== undefined && (
                      <span className="text-[10px] text-[#585b70] shrink-0 ml-2 font-mono">
                        {item.size > 1024 ? `${(item.size / 1024).toFixed(1)}k` : `${item.size}b`}
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-xs text-[#585b70] space-y-2">
                <div>(Empty folder)</div>
                <div className="text-[10px] text-[#45475a]">Press &quot;a&quot; to create a note here</div>
              </div>
            )}
          </div>

          {/* Column 3: Live Preview Pane (40% width) */}
          <div className="flex-1 bg-[#11111b]/50 overflow-hidden flex flex-col">
            <div className="h-8 border-b border-[#313244]/60 px-3 flex items-center justify-between text-[11px] bg-[#1e1e2e]/40">
              <span className="text-[#6c7086] truncate">
                {selectedItem ? selectedItem.name : 'Preview'}
              </span>
              {selectedItem?.type === 'file' && (
                <span className="text-[10px] text-[#89b4fa]">Markdown</span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 text-xs font-mono">
              {selectedItem?.type === 'directory' ? (
                <div className="space-y-1 text-xs">
                  <div className="text-[#89b4fa] font-semibold mb-2">
                    Directory Contents ({selectedItem.children?.length || 0})
                  </div>
                  {selectedItem.children && selectedItem.children.length > 0 ? (
                    selectedItem.children.map((child) => (
                      <div key={child.path} className="flex items-center space-x-2 text-[#a6adc8] py-0.5">
                        {child.type === 'directory' ? (
                          <Folder size={12} className="text-[#89b4fa]" />
                        ) : (
                          <FileText size={12} className="text-[#6c7086]" />
                        )}
                        <span className="truncate">{child.name}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[#585b70] text-[11px] italic">Empty directory</div>
                  )}
                </div>
              ) : previewLoading ? (
                <div className="flex items-center justify-center h-32 text-[#585b70]">
                  Loading preview...
                </div>
              ) : previewContent ? (
                <pre className="text-[11px] leading-relaxed text-[#cdd6f4] whitespace-pre-wrap font-mono">
                  {previewContent}
                </pre>
              ) : (
                <div className="flex items-center justify-center h-32 text-[#585b70] text-[11px]">
                  Select a file to preview
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Navigation Key Hints (Yazi style) */}
        <div className="h-8 bg-[#181825] border-t border-[#313244] px-4 flex items-center justify-between text-[11px] text-[#6c7086]">
          <div className="flex items-center space-x-3">
            <span><kbd className="bg-[#313244] px-1.5 py-0.5 rounded text-[#cdd6f4]">h/l</kbd> parent/open</span>
            <span><kbd className="bg-[#313244] px-1.5 py-0.5 rounded text-[#cdd6f4]">j/k</kbd> up/down</span>
            <span><kbd className="bg-[#313244] px-1.5 py-0.5 rounded text-[#cdd6f4]">Enter</kbd> open</span>
            <span><kbd className="bg-[#313244] px-1.5 py-0.5 rounded text-[#a6e3a1]">a</kbd> new note</span>
            <span><kbd className="bg-[#313244] px-1.5 py-0.5 rounded text-[#89b4fa]">A</kbd> new folder</span>
            <span><kbd className="bg-[#313244] px-1.5 py-0.5 rounded text-[#fab387]">r</kbd> rename</span>
            <span><kbd className="bg-[#313244] px-1.5 py-0.5 rounded text-[#f38ba8]">d</kbd> delete</span>
          </div>
          <span><kbd className="bg-[#313244] px-1.5 py-0.5 rounded text-[#cdd6f4]">q / Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
};
