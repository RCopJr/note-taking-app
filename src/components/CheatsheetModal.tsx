import React, { useState, useMemo, useEffect } from 'react';
import { HelpCircle, Search, X } from 'lucide-react';

export interface CheatsheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaderKey?: string;
}

interface CheatItem {
  category: 'Vim Motions & Commands' | 'Markdown Syntax' | 'Lists & Structure';
  command: string;
  description: string;
  example?: string;
}
export const CheatsheetModal: React.FC<CheatsheetModalProps> = ({
  isOpen,
  onClose,
  leaderKey = '<Space>',
}) => {
  const [filter, setFilter] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
  const items: CheatItem[] = useMemo(() => [
    // Vim & Shortcuts
    { category: 'Vim Motions & Commands', command: `${leaderKey}ff / Cmd+P`, description: 'Find notes by file path or title (Telescope)' },
    { category: 'Vim Motions & Commands', command: `${leaderKey}fw / Cmd+Shift+F`, description: 'Live grep search across note contents (SQLite FTS5)' },
    { category: 'Vim Motions & Commands', command: `${leaderKey}g / :gdoc`, description: 'Copy rich-text HTML for Google Docs' },
    { category: 'Vim Motions & Commands', command: `${leaderKey}e`, description: 'Toggle left sidebar folder tree' },
    { category: 'Vim Motions & Commands', command: `${leaderKey}tr / :raw`, description: 'Toggle Obsidian-style Live Preview vs Raw text' },
    { category: 'Vim Motions & Commands', command: `${leaderKey}?`, description: 'Open this Markdown & Vim cheatsheet' },
    { category: 'Vim Motions & Commands', command: 'jk or jj or Esc', description: 'Exit Insert mode back to Normal mode' },
    { category: 'Vim Motions & Commands', command: `${leaderKey}w / :w / Cmd+S`, description: 'Save current note' },
    { category: 'Vim Motions & Commands', command: 'i / a / o', description: 'Enter Insert mode (at cursor / after / on new line below)' },
    { category: 'Vim Motions & Commands', command: 'dd / yy / p', description: 'Delete line / yank (copy) line / put (paste)' },
    { category: 'Vim Motions & Commands', command: 'ciw / caw', description: 'Change inner word / change around word' },
    { category: 'Vim Motions & Commands', command: 'j / k', description: 'Move down / up by visual screen line (through wrapped lines)' },
    { category: 'Vim Motions & Commands', command: 'gj / gk', description: 'Move down / up by logical buffer line' },
    { category: 'Vim Motions & Commands', command: 'v / V', description: 'Character visual mode / line visual mode' },

    // Markdown Syntax
    { category: 'Markdown Syntax', command: '# Heading 1', description: 'Top level heading', example: '# Title' },
    { category: 'Markdown Syntax', command: '## Heading 2', description: 'Secondary section heading', example: '## Subtitle' },
    { category: 'Markdown Syntax', command: '### Heading 3', description: 'Tertiary section heading', example: '### Details' },
    { category: 'Markdown Syntax', command: '**bold**', description: 'Bold text emphasis', example: '**important**' },
    { category: 'Markdown Syntax', command: '*italic*', description: 'Italic text emphasis', example: '*subtle*' },
    { category: 'Markdown Syntax', command: '~~strikethrough~~', description: 'Crossed-out text', example: '~~deprecated~~' },
    { category: 'Markdown Syntax', command: '`code`', description: 'Inline monospace code block', example: '`console.log()`' },
    { category: 'Markdown Syntax', command: '```lang\ncode\n```', description: 'Fenced code block', example: '```ts\nconst x = 1;\n```' },
    { category: 'Markdown Syntax', command: '[[Bible: John 3:16]]', description: 'Bible passage using the configured default version', example: '[[Bible: Psalm 23]]' },
    { category: 'Markdown Syntax', command: '[[Bible: John 3:16 | ESV]]', description: 'Bible passage with an explicit version', example: '[[Bible: Romans 8:1-4 | ESV]]' },

    // Lists & Structure
    { category: 'Lists & Structure', command: '- [ ] task', description: 'Interactive task checklist item (click to toggle)', example: '- [x] Done' },
    { category: 'Lists & Structure', command: '- item or * item', description: 'Unordered bullet list', example: '- Bullet item' },
    { category: 'Lists & Structure', command: '1. item', description: 'Numbered ordered list', example: '1. First step' },
    { category: 'Lists & Structure', command: '> quote', description: 'Blockquote formatting', example: '> Notable thought' },
    { category: 'Lists & Structure', command: '| Col 1 | Col 2 |', description: 'Table row and column structure', example: '| A | B |\n|---|---|\n| 1 | 2 |' },
    { category: 'Lists & Structure', command: '[Link](https://...)', description: 'Hyperlink to external URL', example: '[Google](https://google.com)' },
  ], [leaderKey]);

  const filteredItems = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.command.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [items, filter]);

  const grouped = useMemo(() => {
    const map: Record<string, CheatItem[]> = {};
    for (const item of filteredItems) {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    }
    return map;
  }, [filteredItems]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 font-sans text-sm text-editor-text"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="w-full max-w-2xl bg-editor-bg border border-editor-border rounded-lg shadow-lg overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 bg-editor-bg border-b border-editor-border">
          <div className="flex items-center space-x-2 text-sm font-semibold text-editor-text">
            <HelpCircle size={16} />
            <span>Markdown & Vim Cheatsheet</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-editor-active text-editor-muted hover:text-editor-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-muted"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="flex shrink-0 items-center px-4 py-2 bg-editor-bg border-b border-editor-border focus-within:ring-2 focus-within:ring-inset focus-within:ring-editor-muted">
          <Search size={15} className="text-editor-muted mr-2 shrink-0" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search commands, syntax, shortcuts..."
            className="w-full min-w-0 bg-transparent py-1 text-sm text-editor-text placeholder-editor-muted focus:outline-none"
            autoFocus
          />
        </div>

        {/* List of shortcuts & syntax */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5 text-sm">
          {Object.entries(grouped).length > 0 ? (
            Object.entries(grouped).map(([category, catItems]) => (
              <div key={category} className="space-y-2">
                <h4 className="text-sm font-semibold text-editor-muted">
                  {category}
                </h4>
                <div className="grid grid-cols-1 gap-1.5 bg-editor-sidebar p-2.5 rounded-lg border border-editor-border">
                  {catItems.map((ci) => (
                    <div
                      key={ci.command}
                      className="flex flex-col sm:flex-row items-start justify-between gap-2 py-2 px-1.5 hover:bg-editor-active rounded transition-colors"
                    >
                      <div className="flex min-w-0 flex-col space-y-1">
                        <span className="font-mono font-semibold text-editor-text break-words">{ci.command}</span>
                        <span className="text-editor-muted text-sm">{ci.description}</span>
                      </div>
                      {ci.example && (
                        <code className="max-w-full sm:max-w-[45%] font-mono text-sm whitespace-pre-wrap break-words bg-editor-bg px-1.5 py-0.5 rounded text-editor-text border border-editor-border shrink-0">
                          {ci.example}
                        </code>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-editor-muted">
              No matching cheatsheet items found.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2 bg-editor-bg border-t border-editor-border text-sm text-editor-muted">
          <span>Press <kbd className="font-mono bg-editor-sidebar border border-editor-border px-1 py-0.5 rounded text-editor-text">Esc</kbd> to close</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-editor-accent hover:bg-editor-text text-white transition-colors cursor-pointer text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-muted focus-visible:ring-offset-2"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
