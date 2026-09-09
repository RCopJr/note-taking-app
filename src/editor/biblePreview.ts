import { Facet, RangeSetBuilder, type Extension } from '@codemirror/state';
import {
  activateHover,
  closeHoverTooltip,
  Decoration,
  type DecorationSet,
  EditorView,
  hoverTooltip,
  type Tooltip,
  type TooltipView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { fetchBiblePassage } from '../api.ts';
import type { BiblePassage } from '../../shared/contracts.ts';

interface BibleReference {
  from: number;
  to: number;
  reference: string;
  explicitVersion: string | null;
}

const BIBLE_REFERENCE_PATTERN = /\[\[Bible:\s*([^|\]\n]+?)\s*(?:\|\s*([^\]\n]+?)\s*)?\]\]/gi;
const bibleVersion = Facet.define<string, string>({
  combine: (values) => values.at(-1) ?? 'ESV',
});

function referencesOnLine(text: string, lineFrom: number): BibleReference[] {
  const references: BibleReference[] = [];
  BIBLE_REFERENCE_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = BIBLE_REFERENCE_PATTERN.exec(text)) !== null) {
    const reference = match[1]?.trim();
    if (!reference) continue;
    references.push({
      from: lineFrom + match.index,
      to: lineFrom + match.index + match[0].length,
      reference,
      explicitVersion: match[2]?.trim() || null,
    });
  }

  return references;
}

function referenceAt(view: EditorView, pos: number): BibleReference | null {
  const line = view.state.doc.lineAt(pos);
  return referencesOnLine(line.text, line.from).find(
    (reference) => pos >= reference.from && pos <= reference.to,
  ) ?? null;
}

function closeFocusedTooltip(view: EditorView): void {
  view.dispatch({ effects: closeHoverTooltip(bibleHoverTooltip) });
}

class BibleReferenceWidget extends WidgetType {
  constructor(
    private readonly reference: BibleReference,
    private readonly version: string,
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-lp-bible-reference';
    button.textContent = this.reference.reference;
    button.dataset.bibleFrom = String(this.reference.from);
    button.setAttribute(
      'aria-label',
      `Read ${this.reference.reference} (${this.version.toUpperCase()})`,
    );

    button.addEventListener('focus', () => {
      activateHover(view, this.reference.from, 1, {
        tooltip: bibleHoverTooltip,
        until: (transaction) => transaction.docChanged,
      });
    });
    button.addEventListener('blur', () => {
      window.setTimeout(() => {
        const active = document.activeElement;
        const tooltip = view.dom.querySelector('.cm-bible-tooltip');
        if (active === button || (active instanceof Node && tooltip?.contains(active))) return;
        closeFocusedTooltip(view);
      }, 120);
    });

    return button;
  }

  eq(other: BibleReferenceWidget): boolean {
    return other.reference.from === this.reference.from
      && other.reference.to === this.reference.to
      && other.reference.reference === this.reference.reference
      && other.version === this.version;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildBibleDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  const version = view.state.facet(bibleVersion);

  for (const { from, to } of view.visibleRanges) {
    let position = from;
    while (position <= to) {
      const line = view.state.doc.lineAt(position);
      if (line.number !== cursorLine) {
        for (const reference of referencesOnLine(line.text, line.from)) {
          builder.add(
            reference.from,
            reference.to,
            Decoration.replace({
              widget: new BibleReferenceWidget(
                reference,
                reference.explicitVersion || version,
              ),
            }),
          );
        }
      }
      position = line.to + 1;
    }
  }

  return builder.finish();
}

const bibleReferencePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildBibleDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildBibleDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

function passageUrl(reference: string): string {
  return `https://www.esv.org/${encodeURIComponent(reference).replaceAll('%20', '+')}/`;
}

function renderPassageText(container: HTMLElement, text: string): void {
  container.replaceChildren();
  const pattern = /\[(\d+)\]/g;
  let offset = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    container.append(document.createTextNode(text.slice(offset, match.index)));
    const number = document.createElement('sup');
    number.className = 'cm-bible-verse-number';
    number.textContent = match[1] ?? '';
    container.append(number);
    offset = match.index + match[0].length;
  }
  container.append(document.createTextNode(text.slice(offset)));
}

function createPassageTooltip(
  view: EditorView,
  reference: BibleReference,
  version: string,
): TooltipView {
  const dom = document.createElement('section');
  dom.className = 'cm-bible-tooltip';
  dom.setAttribute('aria-label', `Bible passage ${reference.reference}`);

  const header = document.createElement('div');
  header.className = 'cm-bible-tooltip-header';
  const link = document.createElement('a');
  link.href = passageUrl(reference.reference);
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = reference.reference;
  header.append(link);

  const versionLabel = document.createElement('span');
  versionLabel.textContent = version.toUpperCase();
  header.append(versionLabel);

  const body = document.createElement('div');
  body.className = 'cm-bible-tooltip-body';
  body.setAttribute('aria-live', 'polite');
  body.textContent = 'Loading passage…';

  const footer = document.createElement('a');
  footer.className = 'cm-bible-tooltip-footer';
  footer.href = 'https://www.esv.org/';
  footer.target = '_blank';
  footer.rel = 'noreferrer';
  footer.textContent = 'English Standard Version (ESV)';

  dom.append(header, body, footer);

  let destroyed = false;
  fetchBiblePassage(reference.reference, version)
    .then((passage: BiblePassage) => {
      if (destroyed) return;
      link.textContent = passage.canonical;
      link.href = passageUrl(passage.canonical);
      versionLabel.textContent = passage.version;
      renderPassageText(body, passage.text);
    })
    .catch((error: unknown) => {
      if (destroyed) return;
      body.classList.add('cm-bible-tooltip-error');
      body.textContent = error instanceof Error ? error.message : 'Bible passage lookup failed.';
    });

  const closeWhenFocusLeaves = () => {
    window.setTimeout(() => {
      const active = document.activeElement;
      const source = view.dom.querySelector(
        `.cm-lp-bible-reference[data-bible-from="${reference.from}"]`,
      );
      if (active instanceof Node && (dom.contains(active) || source?.contains(active))) return;
      closeFocusedTooltip(view);
    }, 120);
  };
  dom.addEventListener('focusout', closeWhenFocusLeaves);
  dom.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeFocusedTooltip(view);
    view.focus();
  });

  return {
    dom,
    destroy: () => {
      destroyed = true;
    },
  };
}

const bibleHoverTooltip = hoverTooltip(
  (view, pos): Tooltip | null => {
    const reference = referenceAt(view, pos);
    if (!reference) return null;
    const version = reference.explicitVersion || view.state.facet(bibleVersion);
    return {
      pos: reference.from,
      end: reference.to,
      above: true,
      arrow: true,
      create: () => createPassageTooltip(view, reference, version),
    };
  },
  {
    hoverTime: 250,
    hideOnChange: true,
  },
);

export function createBiblePreviewExtension(defaultVersion: string): Extension {
  return [
    bibleVersion.of(defaultVersion),
    bibleReferencePlugin,
    bibleHoverTooltip,
  ];
}
