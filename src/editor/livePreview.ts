import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { RangeSetBuilder, Compartment } from '@codemirror/state';

export const livePreviewCompartment = new Compartment();

class CheckboxWidget extends WidgetType {
  private checked: boolean;
  private pos: number;

  constructor(checked: boolean, pos: number) {
    super();
    this.checked = checked;
    this.pos = pos;
  }

  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.checked;
    input.className = 'cm-lp-task-box';

    input.onchange = (e) => {
      e.preventDefault();
      const newChar = input.checked ? 'x' : ' ';
      view.dispatch({
        changes: { from: this.pos, to: this.pos + 1, insert: newChar },
      });
    };

    return input;
  }

  eq(other: CheckboxWidget): boolean {
    return this.checked === other.checked && this.pos === other.pos;
  }
}

// Decoration definitions
const headingDecorations: Record<number, Decoration> = {
  1: Decoration.line({ class: 'cm-lp-h1' }),
  2: Decoration.line({ class: 'cm-lp-h2' }),
  3: Decoration.line({ class: 'cm-lp-h3' }),
  4: Decoration.line({ class: 'cm-lp-h4' }),
  5: Decoration.line({ class: 'cm-lp-h5' }),
  6: Decoration.line({ class: 'cm-lp-h6' }),
};

const blockquoteLineDeco = Decoration.line({ class: 'cm-lp-blockquote' });
const hiddenSyntaxDeco = Decoration.mark({ class: 'cm-lp-hidden-syntax' });
const boldDeco = Decoration.mark({ class: 'cm-lp-bold' });
const italicDeco = Decoration.mark({ class: 'cm-lp-italic' });
const strikethroughDeco = Decoration.mark({ class: 'cm-lp-strikethrough' });
const inlineCodeDeco = Decoration.mark({ class: 'cm-lp-inline-code' });

interface RangeItem {
  from: number;
  to: number;
  value: Decoration;
}

function buildLivePreviewDecorations(view: EditorView): DecorationSet {
  const lineDecos: RangeItem[] = [];
  const markDecos: RangeItem[] = [];

  const selection = view.state.selection.main;
  const cursorLine = view.state.doc.lineAt(selection.head).number;

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const isCursorOnLine = line.number === cursorLine;
      const text = line.text;

      // Only apply rich transformations when cursor is NOT on this line
      if (!isCursorOnLine && text.length > 0) {
        // 1. Headings: # Heading
        const headingMatch = text.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch && headingMatch[1]) {
          const level = headingMatch[1].length;
          lineDecos.push({
            from: line.from,
            to: line.from,
            value: headingDecorations[level] || headingDecorations[6],
          });

          // Hide the "# " syntax symbols
          markDecos.push({
            from: line.from,
            to: line.from + level + 1,
            value: hiddenSyntaxDeco,
          });
        }

        // 2. Blockquotes: > Quote
        if (/^>\s+/.test(text)) {
          lineDecos.push({
            from: line.from,
            to: line.from,
            value: blockquoteLineDeco,
          });
          markDecos.push({
            from: line.from,
            to: line.from + 2,
            value: hiddenSyntaxDeco,
          });
        }

        // 3. Task lists: - [ ] or - [x]
        const taskMatch = text.match(/^(\s*[-*]\s+)\[([ xX])\]\s+/);
        if (taskMatch) {
          const prefixLen = taskMatch[1].length;
          const boxPos = line.from + prefixLen + 1; // position of ' ' or 'x'
          const isChecked = taskMatch[2].toLowerCase() === 'x';

          markDecos.push({
            from: line.from + prefixLen,
            to: line.from + prefixLen + 3,
            value: Decoration.replace({
              widget: new CheckboxWidget(isChecked, boxPos),
            }),
          });
        }

        // 4. Inline Bold: **text**
        const boldRegex = /\*\*(.+?)\*\*/g;
        let bMatch: RegExpExecArray | null;
        while ((bMatch = boldRegex.exec(text)) !== null) {
          const start = line.from + bMatch.index;
          const end = start + bMatch[0].length;
          markDecos.push({ from: start, to: start + 2, value: hiddenSyntaxDeco });
          markDecos.push({ from: start + 2, to: end - 2, value: boldDeco });
          markDecos.push({ from: end - 2, to: end, value: hiddenSyntaxDeco });
        }

        // 4b. Inline Italic: *text*
        const italicRegex = /(?<!\*)\*([^*]+?)\*(?!\*)/g;
        let iMatch: RegExpExecArray | null;
        while ((iMatch = italicRegex.exec(text)) !== null) {
          const start = line.from + iMatch.index;
          const end = start + iMatch[0].length;
          markDecos.push({ from: start, to: start + 1, value: hiddenSyntaxDeco });
          markDecos.push({ from: start + 1, to: end - 1, value: italicDeco });
          markDecos.push({ from: end - 1, to: end, value: hiddenSyntaxDeco });
        }

        // 5. Inline Strikethrough: ~~text~~
        const strikeRegex = /~~(.+?)~~/g;
        let sMatch: RegExpExecArray | null;
        while ((sMatch = strikeRegex.exec(text)) !== null) {
          const start = line.from + sMatch.index;
          const end = start + sMatch[0].length;
          markDecos.push({ from: start, to: start + 2, value: hiddenSyntaxDeco });
          markDecos.push({ from: start + 2, to: end - 2, value: strikethroughDeco });
          markDecos.push({ from: end - 2, to: end, value: hiddenSyntaxDeco });
        }

        // 6. Inline Code: `code`
        const codeRegex = /`([^`]+)`/g;
        let cMatch: RegExpExecArray | null;
        while ((cMatch = codeRegex.exec(text)) !== null) {
          const start = line.from + cMatch.index;
          const end = start + cMatch[0].length;
          markDecos.push({ from: start, to: end, value: inlineCodeDeco });
        }
      }

      pos = line.to + 1;
    }
  }

  // RangeSetBuilder requires strictly sorted ranges by `from` then `to`
  const builder = new RangeSetBuilder<Decoration>();
  const allRanges = [...lineDecos, ...markDecos].sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from;
    return a.to - b.to;
  });

  for (const range of allRanges) {
    builder.add(range.from, range.to, range.value);
  }

  return builder.finish();
}

export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLivePreviewDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet
      ) {
        this.decorations = buildLivePreviewDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);
