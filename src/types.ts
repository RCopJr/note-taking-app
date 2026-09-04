export interface NoteMetadata {
  id: string;
  path: string;
  title: string;
  tags: string[];
  size: number;
  updatedAt: number;
}

export interface NoteDocument {
  id: string;
  path: string;
  title: string;
  content: string;
  tags: string[];
  size: number;
  updatedAt: number;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  updatedAt?: number;
  children?: FileNode[];
}

export interface VimKeymap {
  before: string;
  after: string;
  mode: 'normal' | 'insert' | 'visual';
}

export interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  lineNumbers: boolean;
  autosave: boolean;
  autosaveDelayMs: number;
  livePreview: boolean;
}

export interface AppConfig {
  notesDir: string;
  leaderKey: string;
  vimKeymaps: VimKeymap[];
  editor: EditorSettings;
}

export interface FtsSearchResult {
  id: string;
  title: string;
  snippet: string;
  tags: string[];
  rank: number;
}

export interface TagCount {
  tag: string;
  count: number;
}
