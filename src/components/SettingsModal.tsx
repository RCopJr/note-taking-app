import React, { useState, useEffect } from 'react';
import { Settings, Save, Plus, Trash2, X, Folder, Keyboard, Sliders } from 'lucide-react';
import type { AppConfig, VimKeymap } from '../types.ts';

export interface SettingsModalProps {
  isOpen: boolean;
  config: AppConfig | null;
  onSave: (updates: Partial<AppConfig>) => Promise<void>;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  config,
  onSave,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'editor' | 'keymaps'>('general');
  const [notesDir, setNotesDir] = useState<string>('');
  const [leaderKey, setLeaderKey] = useState<string>('<Space>');

  const [fontSize, setFontSize] = useState<number>(15);
  const [fontFamily, setFontFamily] = useState<string>('JetBrains Mono, Menlo, Monaco, monospace');
  const [lineNumbers, setLineNumbers] = useState<boolean>(true);
  const [livePreview, setLivePreview] = useState<boolean>(true);
  const [autosave, setAutosave] = useState<boolean>(true);
  const [autosaveDelayMs, setAutosaveDelayMs] = useState<number>(500);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 font-mono"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#1e1e2e] border border-[#313244] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#181825] border-b border-[#313244]">
          <div className="flex items-center space-x-2 text-sm font-semibold text-[#89b4fa]">
            <Settings size={16} />
            <span>Preferences & Settings</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#cdd6f4] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center px-4 pt-2 bg-[#181825] border-b border-[#313244] text-xs space-x-2">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 border-b-2 font-medium cursor-pointer transition-colors ${
              activeTab === 'general'
                ? 'border-[#89b4fa] text-[#89b4fa]'
                : 'border-transparent text-[#a6adc8] hover:text-[#cdd6f4]'
            }`}
          >
            <Folder size={13} />
            <span>General & Storage</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 border-b-2 font-medium cursor-pointer transition-colors ${
              activeTab === 'editor'
                ? 'border-[#89b4fa] text-[#89b4fa]'
                : 'border-transparent text-[#a6adc8] hover:text-[#cdd6f4]'
            }`}
          >
            <Sliders size={13} />
            <span>Editor</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('keymaps')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 border-b-2 font-medium cursor-pointer transition-colors ${
              activeTab === 'keymaps'
                ? 'border-[#89b4fa] text-[#89b4fa]'
                : 'border-transparent text-[#a6adc8] hover:text-[#cdd6f4]'
            }`}
          >
            <Keyboard size={13} />
            <span>Vim Keymaps</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 text-xs space-y-4">
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[#a6adc8] font-semibold block">
                  Notes Storage Directory
                </label>
                <input
                  type="text"
                  value={notesDir}
                  onChange={(e) => setNotesDir(e.target.value)}
                  placeholder="~/notes"
                  className="w-full bg-[#181825] border border-[#313244] rounded px-3 py-1.5 text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
                />
                <p className="text-[11px] text-[#6c7086]">
                  Source of truth directory on your machine. Files are plain .md and .txt indexed automatically.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[#a6adc8] font-semibold block">
                  Leader Key
                </label>
                <input
                  type="text"
                  value={leaderKey}
                  onChange={(e) => setLeaderKey(e.target.value)}
                  placeholder="<Space>"
                  className="w-32 bg-[#181825] border border-[#313244] rounded px-3 py-1.5 text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
                />
                <p className="text-[11px] text-[#6c7086]">
                  Prefix for Telescope commands (e.g. &lt;Space&gt;ff, &lt;Space&gt;fw, &lt;Space&gt;g).
                </p>
              </div>
            </div>
          )}

          {activeTab === 'editor' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[#a6adc8] font-semibold block">Font Size (px)</label>
                  <input
                    type="number"
                    min={11}
                    max={28}
                    value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value, 10) || 15)}
                    className="w-full bg-[#181825] border border-[#313244] rounded px-3 py-1.5 text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[#a6adc8] font-semibold block">Autosave Delay (ms)</label>
                  <input
                    type="number"
                    min={200}
                    max={5000}
                    step={100}
                    value={autosaveDelayMs}
                    onChange={(e) => setAutosaveDelayMs(parseInt(e.target.value, 10) || 500)}
                    className="w-full bg-[#181825] border border-[#313244] rounded px-3 py-1.5 text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[#a6adc8] font-semibold block">Font Family</label>
                <input
                  type="text"
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-3 py-1.5 text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-[#313244]/60">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lineNumbers}
                    onChange={(e) => setLineNumbers(e.target.checked)}
                    className="accent-[#89b4fa]"
                  />
                  <span className="text-[#cdd6f4]">Display Line Numbers</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={livePreview}
                    onChange={(e) => setLivePreview(e.target.checked)}
                    className="accent-[#89b4fa]"
                  />
                  <span className="text-[#cdd6f4]">Enable Obsidian-Style Live Preview by default</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autosave}
                    onChange={(e) => setAutosave(e.target.checked)}
                    className="accent-[#89b4fa]"
                  />
                  <span className="text-[#cdd6f4]">Enable continuous debounced autosave</span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'keymaps' && (
            <div className="space-y-4">
              <p className="text-[11px] text-[#a6adc8]">
                Custom Vim key remappings stored in <code className="bg-[#181825] px-1 py-0.5 rounded text-[#89b4fa]">~/.config/notes/config.json</code>.
              </p>

              {/* Existing Keymaps Table */}
              <div className="border border-[#313244] rounded overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-[#181825] text-[#6c7086] text-[10px] uppercase">
                    <tr>
                      <th className="py-1.5 px-3">Before</th>
                      <th className="py-1.5 px-3">After</th>
                      <th className="py-1.5 px-3">Mode</th>
                      <th className="py-1.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#313244]/50">
                    {keymaps.map((km, idx) => (
                      <tr key={`${km.before}-${km.after}-${km.mode}`} className="hover:bg-[#313244]/20">
                        <td className="py-1.5 px-3 font-semibold text-[#fab387]">{km.before}</td>
                        <td className="py-1.5 px-3 text-[#a6e3a1]">{km.after}</td>
                        <td className="py-1.5 px-3 text-[#a6adc8] uppercase text-[10px]">{km.mode}</td>
                        <td className="py-1.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveKeymap(idx)}
                            className="text-[#6c7086] hover:text-[#f38ba8] p-1 cursor-pointer"
                            title="Remove keymap"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {keymaps.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-[#585b70]">
                          No custom keymaps registered.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Add New Keymap Form */}
              <div className="p-3 bg-[#181825] rounded border border-[#313244] space-y-2">
                <span className="text-[11px] font-semibold text-[#89b4fa] block">
                  Add Custom Keymap
                </span>
                <div className="grid grid-cols-4 gap-2">
                  <input
                    type="text"
                    placeholder="Before (e.g. jk)"
                    value={newBefore}
                    onChange={(e) => setNewBefore(e.target.value)}
                    className="bg-[#11111b] border border-[#313244] rounded px-2.5 py-1 text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
                  />
                  <input
                    type="text"
                    placeholder="After (e.g. <Esc>)"
                    value={newAfter}
                    onChange={(e) => setNewAfter(e.target.value)}
                    className="bg-[#11111b] border border-[#313244] rounded px-2.5 py-1 text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
                  />
                  <select
                    value={newMode}
                    onChange={(e) => setNewMode(e.target.value as 'normal' | 'insert' | 'visual')}
                    className="bg-[#11111b] border border-[#313244] rounded px-2 py-1 text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
                  >
                    <option value="insert">insert</option>
                    <option value="normal">normal</option>
                    <option value="visual">visual</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddKeymap}
                    className="flex items-center justify-center space-x-1 px-3 py-1 rounded bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] font-medium transition-colors cursor-pointer"
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
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#181825] border-t border-[#313244] text-xs">
          <span className="text-[#a6e3a1] font-medium">{saveMessage}</span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#89b4fa] hover:bg-[#b4befe] text-[#11111b] font-semibold transition-colors cursor-pointer disabled:opacity-50"
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
