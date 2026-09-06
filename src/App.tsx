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
  renamePath,
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
import { TelescopeModal, type TelescopeMode } from './components/TelescopeModal.tsx';
import { YaziModal } from './components/YaziModal.tsx';
import { ExportModal } from './components/ExportModal.tsx';
import { CheatsheetModal } from './components/CheatsheetModal.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { FileText } from 'lucide-react';

export const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [, setTags] = useState<TagCount[]>([]);
  const [activeNote, setActiveNote] = useState<NoteDocument | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Modals
  const [isExplorerOpen, setIsExplorerOpen] = useState<boolean>(false);
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

  // Global keyboard listeners and shortcuts
  useEffect(() => {
    const onFindFiles = () => {
      setTelescopeMode('files');
      setIsTelescopeOpen(true);
    };

    const onLiveGrep = () => {
      setTelescopeMode('grep');
      setIsTelescopeOpen(true);
    };

    const onOpenExplorer = () => {
      setIsExplorerOpen(true);
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
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        onOpenExplorer();
      } else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        onOpenSettings();
      }
    };

    window.addEventListener('notes:find-files', onFindFiles);
    window.addEventListener('notes:live-grep', onLiveGrep);
    window.addEventListener('notes:open-explorer', onOpenExplorer);
    window.addEventListener('notes:export-gdoc', onExport);
    window.addEventListener('notes:open-cheatsheet', onCheatsheet);
    window.addEventListener('notes:open-settings', onOpenSettings);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('notes:find-files', onFindFiles);
      window.removeEventListener('notes:live-grep', onLiveGrep);
      window.removeEventListener('notes:open-explorer', onOpenExplorer);
      window.removeEventListener('notes:export-gdoc', onExport);
      window.removeEventListener('notes:open-cheatsheet', onCheatsheet);
      window.removeEventListener('notes:open-settings', onOpenSettings);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const handleCloseModals = () => {
    setIsTelescopeOpen(false);
    setIsExplorerOpen(false);
    setIsExportOpen(false);
    setIsCheatsheetOpen(false);
    setIsSettingsOpen(false);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('notes:focus-editor'));
    }, 20);
  };

  const handleSelectNote = async (noteId: string, searchMatch?: string) => {
    try {
      const note = await fetchNote(noteId);
      setActiveNote(note);
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('notes:focus-editor', { detail: { match: searchMatch } })
        );
      }, 60);
    } catch (err) {
      console.error('Failed to open note:', err);
    }
  };

  const handleSave = useCallback(async (content: string) => {
    if (!activeNote) return;
    const updated = await saveNoteContent(activeNote.id, content);
    setActiveNote(updated);

    // Update note title and metadata in list
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
      handleCloseModals();
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

  const handleRenamePath = async (oldPath: string, newPath: string) => {
    try {
      await renamePath(oldPath, newPath);
      if (activeNote?.id === oldPath) {
        const renamed = await fetchNote(newPath);
        setActiveNote(renamed);
      }
      await refreshData();
    } catch (err) {
      alert(`Failed to rename: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSaveConfig = async (updates: Partial<AppConfig>) => {
    const updated = await updateConfig(updates);
    setConfig(updated);
    await refreshData();
  };

  if (isLoading) {
    return (
        <div className="flex h-screen w-screen items-center justify-center bg-white text-[#24292e]">
          <div className="flex flex-col items-center space-y-3 font-mono text-sm">
            <div className="w-7 h-7 border-2 border-[#24292e] border-t-transparent rounded-full animate-spin" />
          <span>Loading Notes...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-white text-[#24292e] overflow-hidden select-none">

      {/* 100% Full-Width Distraction-Free CodeMirror Editor */}
      <main className="flex-1 h-full w-full overflow-hidden flex flex-col bg-white">
        {activeNote ? (
          <Editor
            key={activeNote.id}
            noteId={activeNote.id}
            initialContent={activeNote.content}
            onSave={handleSave}
            leaderKey={config?.leaderKey || '<Space>'}
            customKeymaps={config?.vimKeymaps || []}
            fontSize={config?.editor.fontSize || 16}
            fontFamily={config?.editor.fontFamily}
            lineNumbers={false}
            livePreview={config?.editor.livePreview ?? true}
            autosave={config?.editor.autosave ?? true}
            autosaveDelayMs={config?.editor.autosaveDelayMs || 500}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#6a737d] space-y-2 font-mono text-xs">
            <FileText size={28} className="opacity-40" />
            <span>
              No note open. Press <kbd className="bg-[#f6f8fa] px-1.5 py-0.5 rounded text-[#24292e] border border-[#e1e4e8]">&lt;Space&gt;-</kbd> to explore files or <kbd className="bg-[#f6f8fa] px-1.5 py-0.5 rounded text-[#24292e] border border-[#e1e4e8]">&lt;Space&gt;ff</kbd> to search.
            </span>
          </div>
        )}
      </main>

      {/* Yazi-Style File Explorer Modal */}
      <YaziModal
        isOpen={isExplorerOpen}
        tree={tree}
        activeNoteId={activeNote?.id || null}
        onSelectNote={handleSelectNote}
        onCreateNote={handleCreateNote}
        onCreateFolder={handleCreateFolder}
        onDeletePath={handleDeletePath}
        onRenamePath={handleRenamePath}
        onClose={handleCloseModals}
      />

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
