import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { Vim } from '@replit/codemirror-vim';
import type { CodeMirror } from '@replit/codemirror-vim';
import {
  registerVimCommands,
  setupVimKeymaps,
  createVimExtension,
} from '../src/editor/vim.ts';
import {
  livePreviewPlugin,
  livePreviewCompartment,
} from '../src/editor/livePreview.ts';

// Minimal mock environment for headless Node
if (typeof document === 'undefined') {
  class MockElement {
    tagName = 'DIV';
    className = '';
    type = '';
    checked = false;
    innerHTML = '';
    style: Record<string, string> = {};
    setAttribute() {}
    appendChild() {}
  }

  class MockDocument {
    createElement() {
      return new MockElement();
    }
    createTextNode() {
      return new MockElement();
    }
  }

  class MockWindow {
    private listeners: Record<string, ((e: Event) => void)[]> = {};

    addEventListener(type: string, cb: (e: Event) => void) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(cb);
    }

    removeEventListener(type: string, cb: (e: Event) => void) {
      if (!this.listeners[type]) return;
      this.listeners[type] = this.listeners[type].filter((l) => l !== cb);
    }

    dispatchEvent(event: Event): boolean {
      const cbs = this.listeners[event.type] || [];
      for (const cb of cbs) cb(event);
      return true;
    }
  }

  const mockWin = new MockWindow();
  global.window = mockWin as unknown as Window & typeof globalThis;
  global.document = new MockDocument() as unknown as Document;
  global.alert = () => {};
  global.CustomEvent = class CustomEvent<T = unknown> extends Event {
    detail: T;
    constructor(type: string, params?: { detail?: T }) {
      super(type);
      this.detail = params?.detail as unknown as T;
    }
  } as unknown as typeof CustomEvent;
}

async function runEditorTests() {
  console.log('--- Starting Phase 2 Editor Verification ---');

  // 1. Test Vim Commands & Keymaps Setup
  console.log('1. Testing Vim commands and keymaps setup');
  registerVimCommands();
  setupVimKeymaps('<Space>', [
    { before: 'jk', after: '<Esc>', mode: 'insert' },
  ]);

  let saveEventFired = false;
  window.addEventListener('notes:save', () => {
    saveEventFired = true;
  });

  // Trigger :w ex-command via Vim dispatcher
  const mockCm = {
    operation: (fn: () => void) => fn(),
    state: { vim: {} },
    getCursor: () => ({ line: 0, ch: 0 }),
  } as unknown as CodeMirror;
  Vim.handleEx(mockCm, 'w');
  assert.ok(saveEventFired, 'Executing :w must fire notes:save custom event');

  // 2. Test Live Preview & State Creation
  console.log('2. Testing CodeMirror 6 EditorState with Live Preview and Vim extensions');
  const sampleDoc = `# Heading 1

This is a **bold** paragraph with \`inline code\`.

- [x] Completed task
- [ ] Incomplete task
> A wise blockquote
`;

  const state = EditorState.create({
    doc: sampleDoc,
    extensions: [
      createVimExtension(),
      markdown(),
      livePreviewCompartment.of(livePreviewPlugin),
    ],
  });

  assert.equal(state.doc.lines, 8, 'Sample document should have 8 lines');
  assert.ok(state.doc.line(1).text.startsWith('# Heading 1'));

  console.log('✅ All Phase 2 Editor Unit Verification Tests Passed!');
}

runEditorTests().catch((err) => {
  console.error('❌ Editor test failed:', err);
  process.exit(1);
});
