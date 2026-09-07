import React, { useState, useEffect } from 'react';
import { Settings, Save, Plus, Trash2, X, Folder, Keyboard, Sliders, BookOpen } from 'lucide-react';
import type { AppConfig, BibleStatus, VimKeymap } from '../types.ts';

export interface SettingsModalProps {
  isOpen: boolean;
  config: AppConfig | null;
  bibleStatus: BibleStatus | null;
  onSave: (updates: Partial<AppConfig>) => Promise<void>;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  config,
  bibleStatus,
  onSave,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'editor' | 'bible' | 'keymaps'>('general');
  const [notesDir, setNotesDir] = useState<string>('');
  const [leaderKey, setLeaderKey] = useState<string>('<Space>');

  const [fontSize, setFontSize] = useState<number>(15);
  const [fontFamily, setFontFamily] = useState<string>('JetBrains Mono, Menlo, Monaco, monospace');
  const [lineNumbers, setLineNumbers] = useState<boolean>(true);
  const [livePreview, setLivePreview] = useState<boolean>(true);
  const [autosave, setAutosave] = useState<boolean>(true);
  const [autosaveDelayMs, setAutosaveDelayMs] = useState<number>(500);
  const [defaultBibleVersion, setDefaultBibleVersion] = useState<'ESV'>('ESV');

  const [keymaps, setKeymaps] = useState<VimKeymap[]>([]);
  const [newBefore, setNewBefore] = useState<string>('');
  const [newAfter, setNewAfter] = useState<string>('');
  const [newMode, setNewMode] = useState<'normal' | 'insert' | 'visual'>('insert');

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>('');

  useEffect(() => {
    if (config && isOpen) {
      setNotesDir(config.notesDir);
      setLeaderKey(config.leaderKey);
      setFontSize(config.editor.fontSize);
      setFontFamily(config.editor.fontFamily);
      setLineNumbers(config.editor.lineNumbers);
      setLivePreview(config.editor.livePreview);
      setAutosave(config.editor.autosave);
      setAutosaveDelayMs(config.editor.autosaveDelayMs);
      setDefaultBibleVersion(config.bible.defaultVersion);
      setKeymaps(config.vimKeymaps || []);
      setSaveMessage('');
    }
  }, [config, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleAddKeymap = () => {
    if (!newBefore.trim() || !newAfter.trim()) return;
    setKeymaps((prev) => [
      ...prev,
      { before: newBefore.trim(), after: newAfter.trim(), mode: newMode },
    ]);
    setNewBefore('');
    setNewAfter('');
  };

  const handleRemoveKeymap = (index: number) => {
    setKeymaps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      await onSave({
        notesDir: notesDir.trim(),
        leaderKey: leaderKey.trim() || '<Space>',
        vimKeymaps: keymaps,
        editor: {
          fontSize,
          fontFamily,
          lineNumbers,
          livePreview,
          autosave,
          autosaveDelayMs,
        },
        bible: {
          defaultVersion: defaultBibleVersion,
        },
      });
      setSaveMessage('Settings saved successfully!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setSaveMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 font-sans text-sm text-editor-text"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-editor-bg border border-editor-border rounded-lg shadow-lg overflow-hidden flex flex-col max-h-[85dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-4 py-3 bg-editor-sidebar border-b border-editor-border">
          <div className="flex items-center space-x-2 text-sm font-semibold text-editor-text">
            <Settings size={16} />
            <span>Preferences & Settings</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="p-1 rounded hover:bg-editor-active text-editor-muted hover:text-editor-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-accent focus-visible:ring-offset-2 focus-visible:ring-offset-editor-sidebar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex shrink-0 items-center overflow-x-auto px-4 pt-2 bg-editor-sidebar border-b border-editor-border text-sm space-x-2">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`flex shrink-0 items-center space-x-1.5 px-3 py-1.5 border-b-2 font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-editor-accent ${
              activeTab === 'general'
                ? 'border-editor-accent bg-editor-active text-editor-text'
                : 'border-transparent text-editor-muted hover:bg-editor-active hover:text-editor-text'
            }`}
          >
            <Folder size={13} />
            <span>General & Storage</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`flex shrink-0 items-center space-x-1.5 px-3 py-1.5 border-b-2 font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-editor-accent ${
              activeTab === 'editor'
                ? 'border-editor-accent bg-editor-active text-editor-text'
                : 'border-transparent text-editor-muted hover:bg-editor-active hover:text-editor-text'
            }`}
          >
            <Sliders size={13} />
            <span>Editor</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bible')}
            className={`flex shrink-0 items-center space-x-1.5 px-3 py-1.5 border-b-2 font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-editor-accent ${
              activeTab === 'bible'
                ? 'border-editor-accent bg-editor-active text-editor-text'
                : 'border-transparent text-editor-muted hover:bg-editor-active hover:text-editor-text'
            }`}
          >
            <BookOpen size={13} />
            <span>Bible</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('keymaps')}
            className={`flex shrink-0 items-center space-x-1.5 px-3 py-1.5 border-b-2 font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-editor-accent ${
              activeTab === 'keymaps'
                ? 'border-editor-accent bg-editor-active text-editor-text'
                : 'border-transparent text-editor-muted hover:bg-editor-active hover:text-editor-text'
            }`}
          >
            <Keyboard size={13} />
            <span>Vim Keymaps</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm space-y-4">
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-editor-text font-semibold block">
                  Notes Storage Directory
                </label>
                <input
                  type="text"
                  value={notesDir}
                  onChange={(e) => setNotesDir(e.target.value)}
                  placeholder="~/notes"
                  className="w-full bg-editor-bg border border-editor-border rounded px-3 py-1.5 font-mono text-editor-text placeholder:text-editor-muted focus:outline-none focus:border-editor-accent focus:ring-2 focus:ring-editor-accent"
                />
                <p className="text-sm text-editor-muted">
                  Source of truth directory on your machine. Files are plain .md and .txt indexed automatically.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-editor-text font-semibold block">
                  Leader Key
                </label>
                <input
                  type="text"
                  value={leaderKey}
                  onChange={(e) => setLeaderKey(e.target.value)}
                  placeholder="<Space>"
                  className="w-32 bg-editor-bg border border-editor-border rounded px-3 py-1.5 font-mono text-editor-text placeholder:text-editor-muted focus:outline-none focus:border-editor-accent focus:ring-2 focus:ring-editor-accent"
                />
                <p className="text-sm text-editor-muted">
                  Prefix for Telescope commands (e.g. &lt;Space&gt;ff, &lt;Space&gt;fw, &lt;Space&gt;g).
                </p>
              </div>
            </div>
          )}

          {activeTab === 'editor' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-editor-text font-semibold block">Font Size (px)</label>
                  <input
                    type="number"
                    min={11}
                    max={28}
                    value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value, 10) || 15)}
                    className="w-full bg-editor-bg border border-editor-border rounded px-3 py-1.5 text-editor-text focus:outline-none focus:border-editor-accent focus:ring-2 focus:ring-editor-accent"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-editor-text font-semibold block">Autosave Delay (ms)</label>
                  <input
                    type="number"
                    min={200}
                    max={5000}
                    step={100}
                    value={autosaveDelayMs}
                    onChange={(e) => setAutosaveDelayMs(parseInt(e.target.value, 10) || 500)}
                    className="w-full bg-editor-bg border border-editor-border rounded px-3 py-1.5 text-editor-text focus:outline-none focus:border-editor-accent focus:ring-2 focus:ring-editor-accent"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-editor-text font-semibold block">Font Family</label>
                <input
                  type="text"
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full bg-editor-bg border border-editor-border rounded px-3 py-1.5 text-editor-text focus:outline-none focus:border-editor-accent focus:ring-2 focus:ring-editor-accent"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-editor-border">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lineNumbers}
                    onChange={(e) => setLineNumbers(e.target.checked)}
                    className="h-4 w-4 shrink-0 accent-editor-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-accent focus-visible:ring-offset-2 focus-visible:ring-offset-editor-bg"
                  />
                  <span className="text-editor-text">Display Line Numbers</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={livePreview}
                    onChange={(e) => setLivePreview(e.target.checked)}
                    className="h-4 w-4 shrink-0 accent-editor-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-accent focus-visible:ring-offset-2 focus-visible:ring-offset-editor-bg"
                  />
                  <span className="text-editor-text">Enable Obsidian-Style Live Preview by default</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autosave}
                    onChange={(e) => setAutosave(e.target.checked)}
                    className="h-4 w-4 shrink-0 accent-editor-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-accent focus-visible:ring-offset-2 focus-visible:ring-offset-editor-bg"
                  />
                  <span className="text-editor-text">Enable continuous debounced autosave</span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'bible' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-editor-text font-semibold block">
                  Default Bible Version
                </label>
                <select
                  value={defaultBibleVersion}
                  onChange={(event) => setDefaultBibleVersion(event.target.value as 'ESV')}
                  className="w-full sm:w-52 bg-editor-bg border border-editor-border rounded px-3 py-1.5 text-editor-text focus:outline-none focus:border-editor-accent focus:ring-2 focus:ring-editor-accent"
                >
                  <option value="ESV">English Standard Version (ESV)</option>
                </select>
                <p className="text-sm text-editor-muted">
                  Used when a reference omits its version, for example <code className="font-mono">[[Bible: John 3:16]]</code>.
                </p>
              </div>

              <div className="space-y-2 border-t border-editor-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-editor-text">ESV API</span>
                  <span
                    className={`rounded border px-2 py-0.5 text-xs font-semibold ${
                      bibleStatus?.configured
                        ? 'border-editor-border bg-editor-active text-editor-text'
                        : 'border-editor-border bg-editor-bg text-editor-muted'
                    }`}
                  >
                    {bibleStatus?.configured ? 'Configured' : 'Not configured'}
                  </span>
                </div>
                <p className="text-sm text-editor-muted">
                  Set <code className="font-mono text-editor-text">ESV_API_KEY</code> in the server environment, then restart the app. The key is never returned to the browser or stored in your notes configuration.
                </p>
              </div>

              <div className="space-y-2 border-t border-editor-border pt-4 text-sm text-editor-muted">
                <p>
                  Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.
                </p>
                <p>
                  Users may not copy or download more than 500 verses of the ESV Bible or more than one half of any book of the ESV Bible.
                </p>
                <a
                  href="https://www.esv.org/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-editor-text underline underline-offset-2"
                >
                  Visit ESV.org
                </a>
              </div>
            </div>
          )}

          {activeTab === 'keymaps' && (
            <div className="space-y-4">
              <p className="text-sm text-editor-muted">
                Custom Vim key remappings stored in <code className="bg-editor-active px-1 py-0.5 rounded font-mono text-editor-text break-all">~/.config/notes/config.json</code>.
              </p>

              {/* Existing Keymaps Table */}
              <div className="border border-editor-border rounded overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-editor-sidebar text-editor-muted text-sm">
                    <tr>
                      <th className="py-1.5 px-3">Before</th>
                      <th className="py-1.5 px-3">After</th>
                      <th className="py-1.5 px-3">Mode</th>
                      <th className="py-1.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-editor-border">
                    {keymaps.map((km, idx) => (
                      <tr key={`${km.before}-${km.after}-${km.mode}`} className="hover:bg-editor-active">
                        <td className="py-1.5 px-3 font-mono font-semibold text-editor-text break-all">{km.before}</td>
                        <td className="py-1.5 px-3 font-mono text-editor-text break-all">{km.after}</td>
                        <td className="py-1.5 px-3 text-editor-muted">{km.mode}</td>
                        <td className="py-1.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveKeymap(idx)}
                            className="text-editor-muted hover:text-editor-text hover:bg-editor-active rounded p-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-accent"
                            title="Remove keymap"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {keymaps.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-editor-muted">
                          No custom keymaps registered.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Add New Keymap Form */}
              <div className="p-3 bg-editor-sidebar rounded border border-editor-border space-y-2">
                <span className="text-sm font-semibold text-editor-text block">
                  Add Custom Keymap
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input
                    type="text"
                    placeholder="Before (e.g. jk)"
                    value={newBefore}
                    onChange={(e) => setNewBefore(e.target.value)}
                    className="min-w-0 bg-editor-bg border border-editor-border rounded px-2.5 py-1.5 font-mono text-editor-text placeholder:text-editor-muted focus:outline-none focus:border-editor-accent focus:ring-2 focus:ring-editor-accent"
                  />
                  <input
                    type="text"
                    placeholder="After (e.g. <Esc>)"
                    value={newAfter}
                    onChange={(e) => setNewAfter(e.target.value)}
                    className="min-w-0 bg-editor-bg border border-editor-border rounded px-2.5 py-1.5 font-mono text-editor-text placeholder:text-editor-muted focus:outline-none focus:border-editor-accent focus:ring-2 focus:ring-editor-accent"
                  />
                  <select
                    value={newMode}
                    onChange={(e) => setNewMode(e.target.value as 'normal' | 'insert' | 'visual')}
                    className="min-w-0 bg-editor-bg border border-editor-border rounded px-2 py-1.5 text-editor-text focus:outline-none focus:border-editor-accent focus:ring-2 focus:ring-editor-accent"
                  >
                    <option value="insert">insert</option>
                    <option value="normal">normal</option>
                    <option value="visual">visual</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddKeymap}
                    className="flex items-center justify-center space-x-1 px-3 py-1.5 rounded border border-editor-border bg-editor-bg hover:bg-editor-active text-editor-text font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-accent focus-visible:ring-offset-2 focus-visible:ring-offset-editor-sidebar"
                  >
                    <Plus size={13} />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-editor-sidebar border-t border-editor-border text-sm">
          <span className="min-w-0 break-words text-editor-text font-medium" role="status" aria-live="polite">{saveMessage}</span>
          <div className="ml-auto flex shrink-0 items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-editor-border bg-editor-bg hover:bg-editor-active text-editor-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-accent focus-visible:ring-offset-2 focus-visible:ring-offset-editor-sidebar"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded border border-editor-accent bg-editor-accent hover:bg-editor-text text-white font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-accent focus-visible:ring-offset-2 focus-visible:ring-offset-editor-sidebar disabled:cursor-not-allowed disabled:border-editor-border disabled:bg-editor-active disabled:text-editor-muted"
            >
              <Save size={13} />
              <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
