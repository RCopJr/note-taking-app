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
    { category: 'Vim Motions & Commands', command: ':w or Cmd+S', description: 'Save current note' },
    { category: 'Vim Motions & Commands', command: 'i / a / o', description: 'Enter Insert mode (at cursor / after / on new line below)' },
    { category: 'Vim Motions & Commands', command: 'dd / yy / p', description: 'Delete line / yank (copy) line / put (paste)' },
    { category: 'Vim Motions & Commands', command: 'ciw / caw', description: 'Change inner word / change around word' },
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 font-mono"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="w-full max-w-2xl bg-[#1e1e2e] border border-[#313244] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#181825] border-b border-[#313244]">
          <div className="flex items-center space-x-2 text-sm font-semibold text-[#89b4fa]">
            <HelpCircle size={16} />
            <span>Markdown & Vim Cheatsheet</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#cdd6f4] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="flex items-center px-4 py-2 bg-[#1e1e2e] border-b border-[#313244]">
          <Search size={15} className="text-[#89b4fa] mr-2" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search commands, syntax, shortcuts..."
            className="w-full bg-transparent text-xs text-[#cdd6f4] placeholder-[#585b70] focus:outline-none"
            autoFocus
          />
        </div>

        {/* List of shortcuts & syntax */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
          {Object.entries(grouped).length > 0 ? (
            Object.entries(grouped).map(([category, catItems]) => (
              <div key={category} className="space-y-2">
                <h4 className="text-[11px] uppercase tracking-wider font-semibold text-[#89b4fa]">
                  {category}
                </h4>
                <div className="grid grid-cols-1 gap-1.5 bg-[#181825] p-2.5 rounded-lg border border-[#313244]/60">
                  {catItems.map((ci) => (
                    <div
                      key={ci.command}
                      className="flex items-start justify-between py-1 px-1.5 hover:bg-[#313244]/40 rounded transition-colors"
                    >
                      <div className="flex flex-col space-y-0.5">
                        <span className="font-semibold text-[#fab387]">{ci.command}</span>
                        <span className="text-[#a6adc8] text-[11px]">{ci.description}</span>
                      </div>
                      {ci.example && (
                        <code className="text-[10px] bg-[#11111b] px-1.5 py-0.5 rounded text-[#a6e3a1] border border-[#313244]/40 shrink-0 ml-3">
                          {ci.example}
                        </code>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-[#585b70]">
              No matching cheatsheet items found.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#181825] border-t border-[#313244] text-[10px] text-[#6c7086]">
          <span>Press <kbd className="bg-[#313244] px-1 py-0.5 rounded text-[#cdd6f4]">Esc</kbd> to close</span>
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 rounded bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] transition-colors cursor-pointer text-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
