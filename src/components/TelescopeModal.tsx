import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, FileText, FileCode, Tag, X } from 'lucide-react';
import type { NoteMetadata, FtsSearchResult } from '../types.ts';
import { searchNotes } from '../api.ts';

export type TelescopeMode = 'files' | 'grep';

export interface TelescopeModalProps {
  isOpen: boolean;
  initialMode?: TelescopeMode;
  notes: NoteMetadata[];
  onSelectNote: (noteId: string, searchMatch?: string) => void;
  onClose: () => void;
}

export const TelescopeModal: React.FC<TelescopeModalProps> = ({
  isOpen,
  initialMode = 'files',
  notes,
  onSelectNote,
  onClose,
}) => {
  const [mode, setMode] = useState<TelescopeMode>(initialMode);
  const [query, setQuery] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [grepResults, setGrepResults] = useState<FtsSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Focus input on open and reset query
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setQuery('');
      setSelectedIndex(0);
      setGrepResults([]);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, initialMode]);

  // Handle global Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Filter files in 'files' mode
  const fileResults = React.useMemo(() => {
    if (mode !== 'files') return [];
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return notes;

    return notes.filter((n) => {
      const matchPath = n.path.toLowerCase().includes(trimmed);
      const matchTitle = n.title.toLowerCase().includes(trimmed);
      const matchTags = n.tags.some((t) => t.toLowerCase().includes(trimmed));
      return matchPath || matchTitle || matchTags;
    });
  }, [mode, query, notes]);

  // Execute FTS search in 'grep' mode
  useEffect(() => {
    if (mode !== 'grep') return;
    const trimmed = query.trim();
    if (!trimmed) {
      setGrepResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      searchNotes(trimmed, 30)
        .then((res) => {
          setGrepResults(res);
          setSelectedIndex(0);
        })
        .catch(() => {
          setGrepResults([]);
        })
        .finally(() => {
          setIsSearching(false);
        });
    }, 150);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [mode, query]);

  const activeResultsCount = mode === 'files' ? fileResults.length : grepResults.length;

  // Handle selection bounds
  useEffect(() => {
    if (selectedIndex >= activeResultsCount && activeResultsCount > 0) {
      setSelectedIndex(activeResultsCount - 1);
    }
  }, [selectedIndex, activeResultsCount]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleConfirm = useCallback(() => {
    if (mode === 'files') {
      const note = fileResults[selectedIndex];
      if (note) {
        onSelectNote(note.id);
        onClose();
      }
    } else {
      const result = grepResults[selectedIndex];
      if (result) {
        onSelectNote(result.id, query);
        onClose();
      }
    }
  }, [mode, fileResults, grepResults, selectedIndex, onSelectNote, onClose]);

  // Key navigation: Up/Down, Ctrl+j/Ctrl+k, Enter, Escape, Tab
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'j') || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < activeResultsCount - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'k') || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : activeResultsCount - 1));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setMode((prev) => (prev === 'files' ? 'grep' : 'files'));
      setSelectedIndex(0);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#1e1e2e] border border-[#313244] rounded-lg shadow-2xl overflow-hidden flex flex-col font-mono"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Telescope Header & Mode Tabs */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#181825] border-b border-[#313244] text-xs">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => { setMode('files'); setSelectedIndex(0); }}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                mode === 'files'
                  ? 'bg-[#89b4fa] text-[#11111b] font-semibold'
                  : 'text-[#a6adc8] hover:text-[#cdd6f4]'
              }`}
            >
              Find Files (<span className="text-[10px]">Tab</span>)
            </button>
            <button
              type="button"
              onClick={() => { setMode('grep'); setSelectedIndex(0); }}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                mode === 'grep'
                  ? 'bg-[#fab387] text-[#11111b] font-semibold'
                  : 'text-[#a6adc8] hover:text-[#cdd6f4]'
              }`}
            >
              Live Grep FTS5 (<span className="text-[10px]">Tab</span>)
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#cdd6f4] transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Search Input Bar */}
        <div className="flex items-center px-3 py-2.5 border-b border-[#313244] bg-[#1e1e2e]">
          <Search size={16} className="text-[#89b4fa] mr-2.5 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              mode === 'files'
                ? 'Search files or titles by name or tag...'
                : 'Search document contents across all notes...'
            }
            className="flex-1 bg-transparent text-sm text-[#cdd6f4] placeholder-[#585b70] focus:outline-none"
          />
          {isSearching && (
            <div className="w-4 h-4 border-2 border-[#fab387] border-t-transparent rounded-full animate-spin ml-2 shrink-0" />
          )}
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="max-h-80 overflow-y-auto divide-y divide-[#313244]/40"
        >
          {mode === 'files' ? (
            fileResults.length > 0 ? (
              fileResults.map((note, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={note.id}
                    data-index={idx}
                    onClick={() => {
                      onSelectNote(note.id);
                      onClose();
                    }}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors text-xs ${
                      isSelected
                        ? 'bg-[#313244] text-[#cdd6f4]'
                        : 'hover:bg-[#181825]/60 text-[#a6adc8]'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <FileText
                        size={14}
                        className={isSelected ? 'text-[#89b4fa]' : 'text-[#585b70]'}
                      />
                      <div className="flex flex-col">
                        <span className={`font-medium truncate ${isSelected ? 'text-[#cdd6f4]' : 'text-[#bac2de]'}`}>
                          {note.title}
                        </span>
                        <span className="text-[10px] text-[#6c7086] truncate">
                          {note.path}
                        </span>
                      </div>
                    </div>

                    {note.tags.length > 0 && (
                      <div className="flex items-center space-x-1 shrink-0 ml-3">
                        <Tag size={10} className="text-[#585b70]" />
                        {note.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] px-1.5 py-0.2 rounded bg-[#181825] border border-[#313244] text-[#a6adc8]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-xs text-[#585b70] space-y-2">
                <div>No matching files found by title.</div>
                {query.trim() && (
                  <button
                    type="button"
                    onClick={() => { setMode('grep'); setSelectedIndex(0); }}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#313244] hover:bg-[#45475a] text-[#fab387] cursor-pointer transition-colors text-xs mt-1"
                  >
                    <span>Search contents for &quot;{query}&quot; (Press Tab)</span>
                  </button>
                )}
              </div>
            )
          ) : grepResults.length > 0 ? (
            grepResults.map((result, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={result.id}
                  data-index={idx}
                    onClick={() => {
                      onSelectNote(result.id, query);
                      onClose();
                    }}
                  className={`flex flex-col px-3 py-2 cursor-pointer transition-colors text-xs ${
                    isSelected
                      ? 'bg-[#313244] text-[#cdd6f4]'
                      : 'hover:bg-[#181825]/60 text-[#a6adc8]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2 truncate">
                      <FileCode
                        size={14}
                        className={isSelected ? 'text-[#fab387]' : 'text-[#585b70]'}
                      />
                      <span className={`font-semibold truncate ${isSelected ? 'text-[#cdd6f4]' : 'text-[#bac2de]'}`}>
                        {result.title}
                      </span>
                      <span className="text-[10px] text-[#6c7086]">
                        ({result.id})
                      </span>
                    </div>
                  </div>

                  {/* Highlighted Snippet */}
                  <div
                    className="text-[11px] text-[#a6adc8] bg-[#11111b] px-2 py-1 rounded border border-[#313244]/60 font-mono overflow-hidden truncate [&>mark]:bg-[#fab387]/30 [&>mark]:text-[#fab387] [&>mark]:px-0.5 [&>mark]:rounded"
                    dangerouslySetInnerHTML={{ __html: result.snippet }}
                  />
                </div>
              );
            })
          ) : query.trim() ? (
            <div className="p-8 text-center text-xs text-[#585b70]">
              {isSearching ? 'Searching notes...' : 'No grep matches found.'}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#585b70]">
              Type to live-grep across all note contents using SQLite FTS5.
            </div>
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] border-t border-[#313244] text-[10px] text-[#6c7086] select-none">
          <div className="flex items-center space-x-3">
            <span><kbd className="bg-[#313244] px-1 py-0.5 rounded text-[#cdd6f4]">↑/↓</kbd> or <kbd className="bg-[#313244] px-1 py-0.5 rounded text-[#cdd6f4]">Ctrl+j/k</kbd> navigate</span>
            <span><kbd className="bg-[#313244] px-1 py-0.5 rounded text-[#cdd6f4]">Enter</kbd> open</span>
            <span><kbd className="bg-[#313244] px-1 py-0.5 rounded text-[#cdd6f4]">Tab</kbd> toggle mode</span>
          </div>
          <span><kbd className="bg-[#313244] px-1 py-0.5 rounded text-[#cdd6f4]">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
};
