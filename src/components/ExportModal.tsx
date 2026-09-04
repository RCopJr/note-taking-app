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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 font-mono"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#1e1e2e] border border-[#313244] rounded-lg shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#181825] border-b border-[#313244]">
          <div className="flex items-center space-x-2 text-sm font-semibold text-[#89b4fa]">
            <Share2 size={16} />
            <span>Export Note ({noteId})</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#cdd6f4] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 space-y-4 text-xs">
          {/* Primary Action: Google Docs Rich-Text Clipboard */}
          <div className="p-3 rounded-lg bg-[#181825] border border-[#313244]">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h4 className="font-semibold text-sm text-[#cdd6f4]">Google Docs Clipboard</h4>
                <p className="text-[#a6adc8] text-[11px] mt-0.5">
                  Copies formatted HTML directly to your clipboard. Paste into Google Docs with <kbd className="bg-[#313244] px-1 py-0.5 rounded text-[#cdd6f4]">Cmd+V</kbd>.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyGoogleDocs}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded font-semibold text-xs transition-all cursor-pointer ${
                  copied
                    ? 'bg-[#a6e3a1] text-[#11111b]'
                    : 'bg-[#89b4fa] hover:bg-[#b4befe] text-[#11111b]'
                }`}
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
              <div className="text-[11px] text-[#a6e3a1] font-medium flex items-center space-x-1">
                <Check size={12} />
                <span>Rich text copied! Switch to Google Docs and press Cmd+V.</span>
              </div>
            )}
          </div>

          {/* Secondary Action: File Downloads */}
          <div className="space-y-2">
            <span className="text-[11px] uppercase tracking-wider text-[#6c7086] font-semibold">
              Download as File
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleDownloadMd}
                className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded bg-[#181825] hover:bg-[#313244] border border-[#313244] text-[#cdd6f4] transition-colors cursor-pointer"
              >
                <Download size={13} className="text-[#89b4fa]" />
                <span>Markdown (.md)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadTxt}
                className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded bg-[#181825] hover:bg-[#313244] border border-[#313244] text-[#cdd6f4] transition-colors cursor-pointer"
              >
                <FileText size={13} className="text-[#a6adc8]" />
                <span>Plain Text (.txt)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadHtml}
                className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded bg-[#181825] hover:bg-[#313244] border border-[#313244] text-[#cdd6f4] transition-colors cursor-pointer"
              >
                <Code size={13} className="text-[#fab387]" />
                <span>HTML (.html)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 py-2 bg-[#181825] border-t border-[#313244] text-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
