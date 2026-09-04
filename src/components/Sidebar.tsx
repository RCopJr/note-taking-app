import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  Plus,
  FolderPlus,
  Trash2,
  Tag,
  RefreshCw,
} from 'lucide-react';
import type { FileNode, TagCount } from '../types.ts';

export interface SidebarProps {
  isOpen: boolean;
  tree: FileNode[];
  activeNoteId: string | null;
  tags: TagCount[];
  selectedTag: string | null;
  onSelectNote: (noteId: string) => void;
  onSelectTag: (tag: string | null) => void;
  onCreateNote: (parentPath?: string) => void;
  onCreateFolder: (parentPath?: string) => void;
  onDeletePath: (path: string) => void;
  onResync: () => void;
}

const TreeNode: React.FC<{
  node: FileNode;
  activeNoteId: string | null;
  depth: number;
  onSelectNote: (path: string) => void;
  onCreateNote: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onDeletePath: (path: string) => void;
}> = ({
  node,
  activeNoteId,
  depth,
  onSelectNote,
  onCreateNote,
  onCreateFolder,
  onDeletePath,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  if (node.type === 'directory') {
    return (
      <div className="select-none text-xs font-mono">
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          className="group flex items-center justify-between py-1.5 pr-2 hover:bg-[#313244]/50 cursor-pointer text-[#a6adc8] hover:text-[#cdd6f4] transition-colors rounded"
        >
          <div className="flex items-center space-x-1.5 truncate">
            {isExpanded ? (
              <ChevronDown size={14} className="text-[#6c7086] shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-[#6c7086] shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen size={14} className="text-[#89b4fa] shrink-0" />
            ) : (
              <Folder size={14} className="text-[#89b4fa] shrink-0" />
            )}
            <span className="font-semibold truncate">{node.name}</span>
          </div>

          <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCreateNote(node.path);
              }}
              title="New Note in folder"
              className="p-1 hover:bg-[#45475a] rounded text-[#a6adc8] hover:text-[#cdd6f4]"
            >
              <Plus size={11} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCreateFolder(node.path);
              }}
              title="New Subfolder"
              className="p-1 hover:bg-[#45475a] rounded text-[#a6adc8] hover:text-[#cdd6f4]"
            >
              <FolderPlus size={11} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete folder "${node.name}" and all contents?`)) {
                  onDeletePath(node.path);
                }
              }}
              title="Delete folder"
              className="p-1 hover:bg-[#45475a] rounded text-[#f38ba8]"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                activeNoteId={activeNoteId}
                depth={depth + 1}
                onSelectNote={onSelectNote}
                onCreateNote={onCreateNote}
                onCreateFolder={onCreateFolder}
                onDeletePath={onDeletePath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = activeNoteId === node.path;

  return (
    <div
      onClick={() => onSelectNote(node.path)}
      style={{ paddingLeft: `${depth * 12 + 18}px` }}
      className={`group flex items-center justify-between py-1.5 pr-2 cursor-pointer transition-colors rounded text-xs font-mono select-none ${
        isActive
          ? 'bg-[#313244] text-[#89b4fa] font-semibold'
          : 'hover:bg-[#313244]/40 text-[#bac2de] hover:text-[#cdd6f4]'
      }`}
    >
      <div className="flex items-center space-x-2 truncate">
        <FileText
          size={13}
          className={isActive ? 'text-[#89b4fa]' : 'text-[#6c7086]'}
        />
        <span className="truncate">{node.name}</span>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Delete note "${node.name}"?`)) {
            onDeletePath(node.path);
          }
        }}
        title="Delete note"
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#45475a] rounded text-[#6c7086] hover:text-[#f38ba8] transition-opacity"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  tree,
  activeNoteId,
  tags,
  selectedTag,
  onSelectNote,
  onSelectTag,
  onCreateNote,
  onCreateFolder,
  onDeletePath,
  onResync,
}) => {
  if (!isOpen) return null;

  return (
    <aside className="w-64 bg-[#181825] border-r border-[#313244] flex flex-col h-full shrink-0 select-none overflow-hidden font-mono">
      {/* Sidebar Header & Actions */}
      <div className="h-10 border-b border-[#313244] px-3 flex items-center justify-between bg-[#1e1e2e]/60">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-[#6c7086]">
          Explorer
        </span>
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => onCreateNote()}
            title="New Note (Root)"
            className="p-1 rounded hover:bg-[#313244] text-[#a6adc8] hover:text-[#cdd6f4] transition-colors cursor-pointer"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={() => onCreateFolder()}
            title="New Folder (Root)"
            className="p-1 rounded hover:bg-[#313244] text-[#a6adc8] hover:text-[#cdd6f4] transition-colors cursor-pointer"
          >
            <FolderPlus size={14} />
          </button>
          <button
            type="button"
            onClick={onResync}
            title="Resync Notes with Disk & SQLite"
            className="p-1 rounded hover:bg-[#313244] text-[#a6adc8] hover:text-[#cdd6f4] transition-colors cursor-pointer"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Tags Bar (If tags exist) */}
      {tags.length > 0 && (
        <div className="p-2 border-b border-[#313244]/60 bg-[#11111b]/30">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <span className="text-[10px] uppercase tracking-wider text-[#585b70] font-semibold flex items-center space-x-1">
              <Tag size={9} />
              <span>Tags</span>
            </span>
            {selectedTag && (
              <button
                type="button"
                onClick={() => onSelectTag(null)}
                className="text-[10px] text-[#89b4fa] hover:underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {tags.map(({ tag, count }) => (
              <button
                key={tag}
                type="button"
                onClick={() => onSelectTag(selectedTag === tag ? null : tag)}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                  selectedTag === tag
                    ? 'bg-[#89b4fa] text-[#11111b] border-[#89b4fa] font-bold'
                    : 'bg-[#181825] text-[#a6adc8] border-[#313244] hover:border-[#45475a]'
                }`}
              >
                #{tag} <span className="opacity-60 text-[9px]">({count})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* File & Folder Tree */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {tree.length > 0 ? (
          tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              activeNoteId={activeNoteId}
              depth={0}
              onSelectNote={onSelectNote}
              onCreateNote={onCreateNote}
              onCreateFolder={onCreateFolder}
              onDeletePath={onDeletePath}
            />
          ))
        ) : (
          <div className="p-4 text-center text-xs text-[#585b70]">
            No notes found.
            <button
              type="button"
              onClick={() => onCreateNote()}
              className="block mx-auto mt-2 text-[#89b4fa] hover:underline"
            >
              + Create Note
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
