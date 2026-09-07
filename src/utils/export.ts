import { Marked, type Tokens } from 'marked';

interface BibleReferenceToken extends Tokens.Generic {
  type: 'bibleReference';
  raw: string;
  reference: string;
  version: string | null;
}

const BIBLE_REFERENCE_PATTERN = /^\[\[Bible:\s*([^|\]\n]+?)\s*(?:\|\s*([^\]\n]+?)\s*)?\]\]/i;
const googleDocsMarkdown = new Marked({
  breaks: true,
  extensions: [{
    name: 'bibleReference',
    level: 'inline',
    start: (source) => source.search(/\[\[Bible:/i),
    tokenizer(source): BibleReferenceToken | undefined {
      const match = BIBLE_REFERENCE_PATTERN.exec(source);
      const reference = match?.[1]?.trim();
      if (!match || !reference) return undefined;

      return {
        type: 'bibleReference',
        raw: match[0],
        reference,
        version: match[2]?.trim() || null,
      };
    },
    renderer(token) {
      const { raw, reference, version } = token as BibleReferenceToken;
      if (version && version.toUpperCase() !== 'ESV') return escapeHtml(raw);

      const url = `https://www.esv.org/${encodeURIComponent(reference).replaceAll('%20', '+')}/`;
      return `<a href="${url}">${escapeHtml(reference)}</a>`;
    },
  }],
});

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Minimal inline styles survive Google Docs paste without fighting its native
// paragraph, heading, and list layout.
export function markdownToGoogleDocsHtml(markdownText: string): string {
  const rawHtml = googleDocsMarkdown.parse(markdownText, { async: false }) as string;

  const styledHtml = rawHtml
    .replace(/<h1>/g, '<h1 style="font-size: 20pt; font-weight: bold; margin: 0 0 8pt 0; padding: 0; text-indent: 0;">')
    .replace(/<h2>/g, '<h2 style="font-size: 16pt; font-weight: bold; margin: 12pt 0 4pt 0; padding: 0; text-indent: 0;">')
    .replace(/<h3>/g, '<h3 style="font-size: 14pt; font-weight: bold; margin: 10pt 0 3pt 0; padding: 0; text-indent: 0;">')
    .replace(/<h4>/g, '<h4 style="font-size: 12pt; font-weight: bold; margin: 8pt 0 2pt 0; padding: 0; text-indent: 0;">')
    .replace(/<p>/g, '<p style="line-height: 1.15; margin: 0 0 6pt 0;">')
    .replace(/<blockquote>/g, '<blockquote style="border-left: 3px solid #999999; padding-left: 10px; margin: 6pt 0;">')
    .replace(/<pre><code(?: class="([^"]*)")?>/g, (_match, className: string | undefined) => {
      const classAttribute = className ? ` class="${escapeHtml(className)}"` : '';
      return `<pre style="margin: 6pt 0; font-family: Consolas, Courier New, monospace; font-size: 9.5pt; line-height: 1.15;"><code${classAttribute} style="font-family: Consolas, Courier New, monospace;">`;
    })
    .replace(/<code>/g, '<code style="font-family: Consolas, Courier New, monospace;">')
    .replace(/<table>/g, '<table style="border-collapse: collapse; width: 100%; margin: 6pt 0;">')
    .replace(/<th>/g, '<th style="border: 1px solid #999999; font-weight: bold; padding: 4px 6px; text-align: left;">')
    .replace(/<td>/g, '<td style="border: 1px solid #999999; padding: 4px 6px; text-align: left;">')
    .replace(/<ul>/g, '<ul style="line-height: 1.15; margin: 0 0 6pt 0;">')
    .replace(/<ol>/g, '<ol style="line-height: 1.15; margin: 0 0 6pt 0;">')
    .replace(/<li>/g, '<li style="margin: 0;">');

  return `<div>${styledHtml}</div>`;
}

export async function copyToGoogleDocsClipboard(markdownText: string): Promise<boolean> {
  const html = markdownToGoogleDocsHtml(markdownText);

  if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      const htmlBlob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([markdownText], { type: 'text/plain' });

      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        }),
      ]);
      return true;
    } catch {
      // Fallback below
    }
  }

  // Fallback using document.execCommand('copy') with hidden rich content
  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  document.body.appendChild(container);

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(container);
  selection?.removeAllRanges();
  selection?.addRange(range);

  let success = false;
  try {
    success = document.execCommand('copy');
  } catch {
    success = false;
  }

  selection?.removeAllRanges();
  document.body.removeChild(container);
  return success;
}

export function downloadFile(filename: string, content: string, mimeType: string = 'text/plain'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
