import React, { useState, useEffect } from 'react';
import { Share2, Check, Download, FileText, Code, X, Copy } from 'lucide-react';
import {
  copyToGoogleDocsClipboard,
  downloadFile,
  markdownToGoogleDocsHtml,
} from '../utils/export.ts';

export interface ExportModalProps {
  isOpen: boolean;
  noteId: string;
  content: string;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  noteId,
  content,
  onClose,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setPreviewHtml(markdownToGoogleDocsHtml(content));
      setCopied(false);
    }
  }, [isOpen, content]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
  const handleCopyGoogleDocs = async () => {
    const success = await copyToGoogleDocsClipboard(content);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleDownloadMd = () => {
    const baseName = noteId.replace(/\.(md|txt)$/, '');
    downloadFile(`${baseName}.md`, content, 'text/markdown');
  };

  const handleDownloadTxt = () => {
    const baseName = noteId.replace(/\.(md|txt)$/, '');
    downloadFile(`${baseName}.txt`, content, 'text/plain');
  };

  const handleDownloadHtml = () => {
    const baseName = noteId.replace(/\.(md|txt)$/, '');
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${baseName}</title>
  <style>
    body { max-width: 800px; margin: 40px auto; padding: 0 20px; font-family: Arial, sans-serif; }
  </style>
</head>
<body>
  ${previewHtml}
</body>
</html>`;
    downloadFile(`${baseName}.html`, fullHtml, 'text/html');
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 font-sans text-sm text-editor-text"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[85vh] bg-editor-bg border border-editor-border rounded-lg shadow-lg overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 bg-editor-bg border-b border-editor-border">
          <div className="flex min-w-0 items-center space-x-2 text-sm font-semibold text-editor-text">
            <Share2 size={16} className="shrink-0" />
            <span className="min-w-0 break-words">Export Note (<span className="font-mono">{noteId}</span>)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 shrink-0 rounded hover:bg-editor-active text-editor-muted hover:text-editor-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-muted"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body Content */}
        <div className="min-h-0 overflow-y-auto p-4 space-y-4 text-sm">
          {/* Primary Action: Google Docs Rich-Text Clipboard */}
          <div className="p-3 rounded-lg bg-editor-sidebar border border-editor-border">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-2">
              <div>
                <h4 className="font-semibold text-sm text-editor-text">Google Docs Clipboard</h4>
                <p className="text-editor-muted text-sm mt-0.5">
                  Copies formatted HTML directly to your clipboard. Paste into Google Docs with <kbd className="font-mono bg-editor-bg border border-editor-border px-1 py-0.5 rounded text-editor-text">Cmd+V</kbd>.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyGoogleDocs}
                className="flex shrink-0 items-center space-x-1.5 px-3 py-1.5 rounded bg-editor-accent hover:bg-editor-text text-white font-semibold text-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-muted focus-visible:ring-offset-2"
              >
                {copied ? (
                  <>
                    <Check size={14} />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>Copy for Google Docs</span>
                  </>
                )}
              </button>
            </div>
            {copied && (
              <div className="text-sm text-editor-text font-medium flex items-center space-x-1">
                <Check size={12} />
                <span>Rich text copied! Switch to Google Docs and press Cmd+V.</span>
              </div>
            )}
          </div>

          {/* Secondary Action: File Downloads */}
          <div className="space-y-2">
            <span className="text-sm text-editor-muted font-semibold">
              Download as File
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleDownloadMd}
                className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded bg-editor-bg hover:bg-editor-active border border-editor-border text-editor-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-muted"
              >
                <Download size={13} className="text-editor-muted shrink-0" />
                <span>Markdown (.md)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadTxt}
                className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded bg-editor-bg hover:bg-editor-active border border-editor-border text-editor-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-muted"
              >
                <FileText size={13} className="text-editor-muted shrink-0" />
                <span>Plain Text (.txt)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadHtml}
                className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded bg-editor-bg hover:bg-editor-active border border-editor-border text-editor-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-muted"
              >
                <Code size={13} className="text-editor-muted shrink-0" />
                <span>HTML (.html)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end px-4 py-2 bg-editor-bg border-t border-editor-border text-sm">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-editor-bg hover:bg-editor-active border border-editor-border text-editor-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-muted"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
