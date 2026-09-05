import React, { useEffect, useState, useCallback } from 'react';
import {
  fetchConfig,
  fetchNotes,
  fetchNote,
  fetchTree,
  fetchTags,
  saveNoteContent,
  createNote,
  createFolder,
  deleteNote,
  updateConfig,
} from './api.ts';
import type {
  AppConfig,
  NoteDocument,
  NoteMetadata,
  FileNode,
  TagCount,
} from './types.ts';
import { Editor } from './editor/Editor.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { TelescopeModal, type TelescopeMode } from './components/TelescopeModal.tsx';
import { ExportModal } from './components/ExportModal.tsx';
import { CheatsheetModal } from './components/CheatsheetModal.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import {
  FileText,
  Search,
  Settings,
  Share2,
  HelpCircle,
  FolderTree,
  Plus,
} from 'lucide-react';

export const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [activeNote, setActiveNote] = useState<NoteDocument | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Modals and Panes
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isTelescopeOpen, setIsTelescopeOpen] = useState<boolean>(false);
  const [telescopeMode, setTelescopeMode] = useState<TelescopeMode>('files');
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isCheatsheetOpen, setIsCheatsheetOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Load all app data from backend
  const refreshData = useCallback(async () => {
    try {
      const [appConfig, allNotes, fileTree, tagList] = await Promise.all([
        fetchConfig(),
        fetchNotes(),
        fetchTree(),
        fetchTags(),
      ]);
      setConfig(appConfig);
      setNotes(allNotes);
      setTree(fileTree);
      setTags(tagList);
      return { appConfig, allNotes };
    } catch (err) {
      console.error('Failed to load notes data:', err);
      return null;
    }
  }, []);

  // Initial mount
  useEffect(() => {
    refreshData().then(async (result) => {
      if (result && result.allNotes.length > 0 && result.allNotes[0]) {
        const firstNote = await fetchNote(result.allNotes[0].id);
        setActiveNote(firstNote);
      }
      setIsLoading(false);
    });
  }, [refreshData]);

  // Global event listeners (Vim ex-commands and shortcuts)
  useEffect(() => {
    const onFindFiles = () => {
      setTelescopeMode('files');
      setIsTelescopeOpen(true);
    };

    const onLiveGrep = () => {
      setTelescopeMode('grep');
      setIsTelescopeOpen(true);
    };

    const onToggleSidebar = () => {
      setIsSidebarOpen((prev) => !prev);
    };

    const onExport = () => setIsExportOpen(true);
    const onCheatsheet = () => setIsCheatsheetOpen(true);
    const onOpenSettings = () => setIsSettingsOpen(true);

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        onLiveGrep();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'k')) {
        e.preventDefault();
        onFindFiles();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'e')) {
        e.preventDefault();
        onToggleSidebar();
      }
    };

    window.addEventListener('notes:find-files', onFindFiles);
    window.addEventListener('notes:live-grep', onLiveGrep);
    window.addEventListener('notes:toggle-sidebar', onToggleSidebar);
    window.addEventListener('notes:export-gdoc', onExport);
    window.addEventListener('notes:open-cheatsheet', onCheatsheet);
    window.addEventListener('notes:open-settings', onOpenSettings);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('notes:find-files', onFindFiles);
      window.removeEventListener('notes:live-grep', onLiveGrep);
      window.removeEventListener('notes:toggle-sidebar', onToggleSidebar);
      window.removeEventListener('notes:export-gdoc', onExport);
      window.removeEventListener('notes:open-cheatsheet', onCheatsheet);
      window.removeEventListener('notes:open-settings', onOpenSettings);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const handleSelectNote = async (noteId: string) => {
    try {
      const note = await fetchNote(noteId);
      setActiveNote(note);
    } catch (err) {
      console.error('Failed to open note:', err);
    }
  };
  const handleCloseModals = () => {
    setIsTelescopeOpen(false);
    setIsExportOpen(false);
    setIsCheatsheetOpen(false);
    setIsSettingsOpen(false);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('notes:focus-editor'));
    }, 20);
  };

  const handleSave = useCallback(async (content: string) => {
    if (!activeNote) return;
    const updated = await saveNoteContent(activeNote.id, content);
    setActiveNote(updated);

    // Update note title and metadata
    setNotes((prev) =>
      prev.map((n) => (n.id === updated.id ? { ...n, title: updated.title, updatedAt: updated.updatedAt } : n))
    );
  }, [activeNote]);

  const handleCreateNote = async (parentPath?: string) => {
    const rawName = prompt(
      parentPath ? `Create note inside "${parentPath}":` : 'Enter note filename (e.g. ideas/draft.md):'
    );
    if (!rawName) return;

    const base = rawName.endsWith('.md') || rawName.endsWith('.txt') ? rawName : `${rawName}.md`;
    const fullId = parentPath ? `${parentPath}/${base}` : base;

    try {
      const created = await createNote(
        fullId,
        `# ${base.replace(/\.(md|txt)$/, '')}\n\n`
      );
      setActiveNote(created);
      await refreshData();
    } catch (err) {
      alert(`Failed to create note: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCreateFolder = async (parentPath?: string) => {
    const folderName = prompt(
      parentPath ? `Create subfolder inside "${parentPath}":` : 'Enter folder name (e.g. projects):'
    );
    if (!folderName) return;

    const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName;
    try {
      await createFolder(fullPath);
      await refreshData();
    } catch (err) {
      alert(`Failed to create folder: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeletePath = async (pathToDelete: string) => {
    try {
      await deleteNote(pathToDelete);
      if (activeNote?.id === pathToDelete) {
        setActiveNote(null);
      }
      await refreshData();
    } catch (err) {
      alert(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSaveConfig = async (updates: Partial<AppConfig>) => {
    const updated = await updateConfig(updates);
    setConfig(updated);
    await refreshData();
  };

  // Filter notes by tag if selected
  const visibleNotes = selectedTag
    ? notes.filter((n) => n.tags.includes(selectedTag))
    : notes;

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#181825] text-[#89b4fa]">
        <div className="flex flex-col items-center space-y-3 font-mono text-sm">
          <div className="w-8 h-8 border-2 border-[#89b4fa] border-t-transparent rounded-full animate-spin" />
          <span>Loading Notes...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#181825] text-[#cdd6f4] overflow-hidden">
      {/* Top Header Navigation Bar */}
      <header className="h-11 bg-[#1e1e2e] border-b border-[#313244] flex items-center justify-between px-4 select-none shrink-0">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              isSidebarOpen
                ? 'bg-[#313244] text-[#89b4fa]'
                : 'hover:bg-[#313244] text-[#a6adc8] hover:text-[#cdd6f4]'
            }`}
            title="Toggle Sidebar (leader e or Cmd+B)"
          >
            <FolderTree size={16} />
          </button>
          <div className="flex items-center space-x-2 text-sm font-semibold tracking-wide text-[#89b4fa]">
            <FileText size={18} />
            <span>VIM NOTES</span>
            <span className="text-[11px] font-mono font-normal text-[#6c7086] bg-[#181825] px-1.5 py-0.5 rounded border border-[#313244]">
              {visibleNotes.length}
            </span>
          </div>
          <span className="text-[#45475a]">/</span>
          <span className="text-xs text-[#a6adc8] font-mono truncate max-w-xs">
            {activeNote ? activeNote.id : 'No note selected'}
          </span>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => handleCreateNote()}
            className="flex items-center space-x-1.5 px-2.5 py-1 text-xs rounded bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] transition-colors cursor-pointer mr-2"
            title="Create New Note"
          >
            <Plus size={14} />
            <span>New Note</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTelescopeMode('files');
              setIsTelescopeOpen(true);
            }}
            className="flex items-center space-x-1 px-2 py-1 text-xs rounded hover:bg-[#313244] text-[#a6adc8] hover:text-[#cdd6f4] transition-colors cursor-pointer"
            title="Find Files (<leader>ff or Cmd+P)"
          >
            <Search size={14} />
            <span className="font-mono text-[11px] bg-[#181825] px-1 py-0.5 rounded border border-[#313244]">
              {config?.leaderKey || '<Space>'}ff
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsExportOpen(true)}
            className="flex items-center space-x-1.5 px-2.5 py-1 text-xs rounded hover:bg-[#313244] text-[#a6adc8] hover:text-[#cdd6f4] transition-colors cursor-pointer"
            title="Export to Google Docs (<leader>g or :gdoc)"
          >
            <Share2 size={14} />
            <span className="hidden sm:inline">Google Docs</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCheatsheetOpen(true)}
            className="p-1.5 rounded hover:bg-[#313244] text-[#a6adc8] hover:text-[#cdd6f4] transition-colors cursor-pointer"
            title="Markdown Cheatsheet (<leader>?)"
          >
            <HelpCircle size={16} />
          </button>

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 rounded hover:bg-[#313244] text-[#a6adc8] hover:text-[#cdd6f4] transition-colors cursor-pointer"
            title="Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* Main Workspace Area with Sidebar + Editor */}
      <div className="flex-1 w-full overflow-hidden flex">
        {/* Hierarchical Folder Tree Sidebar */}
        <Sidebar
          isOpen={isSidebarOpen}
          tree={tree}
          activeNoteId={activeNote?.id || null}
          tags={tags}
          selectedTag={selectedTag}
          onSelectNote={handleSelectNote}
          onSelectTag={setSelectedTag}
          onCreateNote={handleCreateNote}
          onCreateFolder={handleCreateFolder}
          onDeletePath={handleDeletePath}
          onResync={refreshData}
        />

        {/* CodeMirror Editor */}
        <main className="flex-1 h-full overflow-hidden flex flex-col">
          {activeNote ? (
            <Editor
              key={activeNote.id}
              noteId={activeNote.id}
              initialContent={activeNote.content}
              onSave={handleSave}
              leaderKey={config?.leaderKey || '<Space>'}
              customKeymaps={config?.vimKeymaps || []}
              fontSize={config?.editor.fontSize || 15}
              fontFamily={config?.editor.fontFamily}
              lineNumbers={config?.editor.lineNumbers ?? true}
              livePreview={config?.editor.livePreview ?? true}
              autosave={config?.editor.autosave ?? true}
              autosaveDelayMs={config?.editor.autosaveDelayMs || 500}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-[#585b70] space-y-2">
              <FileText size={32} />
              <span>No note open. Create or select a note from the sidebar.</span>
            </div>
          )}
        </main>
      </div>

      {/* Telescope Search Modal */}
      <TelescopeModal
        isOpen={isTelescopeOpen}
        initialMode={telescopeMode}
        notes={notes}
        onSelectNote={handleSelectNote}
        onClose={handleCloseModals}
      />

      {/* Google Docs & File Export Modal */}
      {activeNote && (
        <ExportModal
          isOpen={isExportOpen}
          noteId={activeNote.id}
          content={activeNote.content}
          onClose={handleCloseModals}
        />
      )}

      {/* Markdown & Vim Cheatsheet Modal */}
      <CheatsheetModal
        isOpen={isCheatsheetOpen}
        leaderKey={config?.leaderKey || '<Space>'}
        onClose={handleCloseModals}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        config={config}
        onSave={handleSaveConfig}
        onClose={handleCloseModals}
      />
    </div>
  );
};
