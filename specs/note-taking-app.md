# Note Taking App - Specification

## 1. Overview
A lightweight, keyboard-centric Markdown and plain text document reader and editor with Vim motions, Obsidian-style Live Preview, Neovim Telescope-style fuzzy search, instant Google Docs rich-text clipboard export, and a dual-layer storage architecture (raw files on disk + SQLite FTS5 search index).

## 2. Architecture & Tech Stack
- **Frontend**: Vite + React 19 + TypeScript + Tailwind CSS + Lucide Icons.
- **Backend API**: Node.js + Hono (`@hono/node-server`) providing local REST endpoints for file and search operations.
- **Storage Layer**:
  - **Source of Truth**: Filesystem directory (`~/notes` by default, configurable via CLI `--dir` or config file). Standard `.md` and `.txt` files.
  - **Search & Index Engine**: Embedded SQLite with FTS5 (`DatabaseSync` from `node:sqlite`), indexed in `~/.config/notes/index.db`.
  - **StorageProvider abstraction**: Clean interface (`listNotes`, `getNote`, `saveNote`, `deleteNote`, `searchNotes`) isolating filesystem calls for future cloud/Git sync.
- **Config Store**: Persistent `~/.config/notes/config.json` for notes directory, custom Vim keymaps, leader key, and editor settings.

## 3. Editor & Live Preview (CodeMirror 6)
- **Engine**: CodeMirror 6 with `@replit/codemirror-vim`.
- **Vim Emulation**:
  - Normal, Insert, and Visual modal editing.
  - Configurable leader key (default `<Space>`).
  - Custom keymaps engine loaded from config (e.g., `jk` -> `<Esc>`).
  - Custom ex-commands: `:w`, `:copy`, `:gdoc`, `:set raw`.
- **Live Preview (Obsidian Style)**:
  - In-place rich rendering of headings, bold, italics, blockquotes, lists, task checkboxes (`- [x]`), tables, and code blocks.
  - Cursor-active line unmasking: reveals raw Markdown syntax when the cursor is on that line.
  - Toggle between Live Preview and 100% raw plain text via `:set raw` or `<leader>tr`.
- **Autosave**: 500ms debounced background autosave with `:w` / `Cmd+S` visual confirmation.

## 4. Telescope-Style Search
- `<leader>ff` (or `Cmd+P` / `Cmd+K`): Find files by path/title with fuzzy ranking.
- `<leader>fw` (or `Cmd+Shift+F`): Live grep querying SQLite FTS5 with BM25 ranking, snippet extraction, and line jump.
- Modal navigation: `Ctrl+j`/`Ctrl+k` or arrow keys to navigate, `Enter` to open, `Esc` to close.

## 5. Google Docs Export & Syntax Cheatsheet
- **Rich-Text Clipboard Exporter** (`<leader>g` or `:gdoc`):
  - Converts Markdown into semantic HTML with Google Docs inline styling.
  - Copies `text/html` and `text/plain` to clipboard via `navigator.clipboard.write`.
  - Pasting (`Cmd+V`) in Google Docs preserves formatting seamlessly.
- **File Download**: Export as `.md`, `.txt`, and `.html`.
- **Markdown Cheatsheet Modal** (`<leader>?`): Searchable reference for GFM syntax.

## 6. Workspace Layout & Organization
- Collapsible sidebar with folder tree and frontmatter tag chips (`tags: [...]`).
- Settings modal for configuring notes directory path and custom Vim keymaps.
