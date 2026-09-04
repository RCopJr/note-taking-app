import { marked } from 'marked';

// Clean inline styling specifically calibrated for Google Docs paste handling
export function markdownToGoogleDocsHtml(markdownText: string): string {
  const rawHtml = marked.parse(markdownText, { async: false }) as string;

  // Enhance tags with inline CSS properties Google Docs parses cleanly
  let styledHtml = rawHtml
    .replace(/<h1>/g, '<h1 style="font-family: Arial, sans-serif; font-size: 24pt; font-weight: bold; color: #111111; margin-top: 18pt; margin-bottom: 6pt;">')
    .replace(/<h2>/g, '<h2 style="font-family: Arial, sans-serif; font-size: 18pt; font-weight: bold; color: #222222; margin-top: 14pt; margin-bottom: 4pt;">')
    .replace(/<h3>/g, '<h3 style="font-family: Arial, sans-serif; font-size: 14pt; font-weight: bold; color: #333333; margin-top: 12pt; margin-bottom: 4pt;">')
    .replace(/<h4>/g, '<h4 style="font-family: Arial, sans-serif; font-size: 12pt; font-weight: bold; color: #444444; margin-top: 10pt; margin-bottom: 2pt;">')
    .replace(/<p>/g, '<p style="font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #333333; margin-top: 0; margin-bottom: 8pt;">')
    .replace(/<blockquote>/g, '<blockquote style="border-left: 3px solid #89b4fa; padding-left: 12px; margin: 10pt 0; font-style: italic; color: #555555;">')
    .replace(/<pre><code>/g, '<pre style="background-color: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px; padding: 12px; font-family: Consolas, Courier New, monospace; font-size: 9.5pt; line-height: 1.45; overflow-x: auto;"><code style="font-family: Consolas, Courier New, monospace;">')
    .replace(/<code>/g, '<code style="font-family: Consolas, Courier New, monospace; background-color: #f1f3f5; color: #e83e8c; padding: 2px 5px; border-radius: 3px; font-size: 9.5pt;">')
    .replace(/<table>/g, '<table style="border-collapse: collapse; width: 100%; margin: 12pt 0; font-family: Arial, sans-serif; font-size: 10pt;">')
    .replace(/<th>/g, '<th style="border: 1px solid #d0d7de; background-color: #f6f8fa; font-weight: bold; padding: 8px 12px; text-align: left;">')
    .replace(/<td>/g, '<td style="border: 1px solid #d0d7de; padding: 8px 12px; text-align: left;">')
    .replace(/<ul>/g, '<ul style="font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #333333; margin-top: 0; margin-bottom: 8pt; padding-left: 24px;">')
    .replace(/<ol>/g, '<ol style="font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #333333; margin-top: 0; margin-bottom: 8pt; padding-left: 24px;">')
    .replace(/<li>/g, '<li style="margin-bottom: 4pt;">');

  return `<div style="font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #333333;">${styledHtml}</div>`;
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
