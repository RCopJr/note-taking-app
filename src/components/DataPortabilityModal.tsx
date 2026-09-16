import React, { useEffect, useRef, useState } from 'react';
import { Archive, Download, FolderInput, ShieldCheck, X } from 'lucide-react';
import { fetchMarkdownArchive, importMarkdown } from '../api.ts';
import type {
  MarkdownImportFile,
  MarkdownImportReport,
} from '../../shared/contracts.ts';

interface DataPortabilityModalProps {
  isOpen: boolean;
  onImported: () => Promise<void>;
  onClose: () => void;
}

function relativeBrowserPath(file: File): string {
  const path = file.webkitRelativePath || file.name;
  const segments = path.split('/');
  return segments.length > 1 ? segments.slice(1).join('/') : path;
}

async function readMarkdownFile(file: File): Promise<MarkdownImportFile> {
  const path = relativeBrowserPath(file);
  if (file.size > 5_000_000) throw new Error(`\"${path}\" exceeds the 5 MB import limit.`);
  try {
    return {
      path,
      content: new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()),
    };
  } catch {
    throw new Error(`\"${path}\" is not valid UTF-8 text.`);
  }
}

function reportCount(report: MarkdownImportReport): number {
  return report.imported.length + report.skipped.length + report.renamed.length + report.failed.length;
}

export const DataPortabilityModal: React.FC<DataPortabilityModalProps> = ({
  isOpen,
  onImported,
  onClose,
}) => {
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<MarkdownImportFile[]>([]);
  const [report, setReport] = useState<MarkdownImportReport | null>(null);
  const [status, setStatus] = useState<'idle' | 'reading' | 'previewing' | 'importing' | 'exporting'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const input = directoryInputRef.current;
    if (input) input.setAttribute('webkitdirectory', '');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && status === 'idle') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, status]);

  const handleDirectory = async (selected: FileList | null) => {
    if (!selected) return;
    setStatus('reading');
    setError(null);
    setReport(null);
    try {
      const supported = [...selected]
        .filter((file) => /\.(md|txt)$/i.test(file.name))
        .sort((left, right) => relativeBrowserPath(left).localeCompare(relativeBrowserPath(right)));
      if (supported.length === 0) throw new Error('The selected directory contains no .md or .txt files.');
      const loaded = await Promise.all(supported.map(readMarkdownFile));
      setFiles(loaded);
      setStatus('previewing');
      setReport(await importMarkdown(loaded, 'dry-run'));
      setStatus('idle');
    } catch (caught) {
      setFiles([]);
      setStatus('idle');
      setError(caught instanceof Error ? caught.message : 'The directory could not be inspected.');
    }
  };

  const handleImport = async () => {
    if (!report || files.length === 0) return;
    const writeCount = report.imported.length + report.renamed.length;
    if (!window.confirm(
      `Import ${writeCount} note${writeCount === 1 ? '' : 's'} into the cloud database? `
      + 'Your selected Markdown files are read-only to this app and will not be modified or deleted.',
    )) return;

    setStatus('importing');
    setError(null);
    try {
      const completed = await importMarkdown(files, 'commit');
      setReport(completed);
      await onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The Markdown import failed.');
    } finally {
      setStatus('idle');
    }
  };

  const handleExport = async () => {
    setStatus('exporting');
    setError(null);
    try {
      const archive = await fetchMarkdownArchive();
      const url = URL.createObjectURL(archive.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = archive.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The Markdown export failed.');
    } finally {
      setStatus('idle');
    }
  };

  if (!isOpen) return null;
  const busy = status !== 'idle';
  const importCount = report ? report.imported.length + report.renamed.length : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-0 font-sans text-sm text-editor-text sm:p-4"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        className="flex h-full max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden border border-editor-border bg-editor-bg shadow-lg sm:h-auto sm:max-h-[85dvh] sm:rounded-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-editor-border bg-editor-sidebar px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <Archive size={16} />
            <span>Data portability</span>
          </div>
          <button
            type="button"
            aria-label="Close data portability"
            disabled={busy}
            onClick={onClose}
            className="rounded p-1 text-editor-muted hover:bg-editor-active hover:text-editor-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <section className="space-y-3 rounded-lg border border-editor-border bg-editor-sidebar p-4">
            <div className="flex items-start gap-3">
              <FolderInput size={18} className="mt-0.5 shrink-0" />
              <div>
                <h2 className="font-semibold">Import a Markdown directory</h2>
                <p className="mt-1 text-editor-muted">
                  Reads supported .md and .txt files, preserves folders, and previews every database change before writing.
                  Source files are never modified or deleted.
                </p>
              </div>
            </div>
            <input
              ref={directoryInputRef}
              type="file"
              multiple
              className="block w-full text-sm file:mr-3 file:rounded file:border file:border-editor-border file:bg-editor-bg file:px-3 file:py-1.5 file:text-editor-text"
              disabled={busy}
              onChange={(event) => void handleDirectory(event.target.files)}
            />

            {report && (
              <div className="space-y-3" aria-live="polite">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <span className="rounded border border-editor-border bg-editor-bg px-2 py-1">Import: {report.imported.length}</span>
                  <span className="rounded border border-editor-border bg-editor-bg px-2 py-1">Renamed: {report.renamed.length}</span>
                  <span className="rounded border border-editor-border bg-editor-bg px-2 py-1">Skipped: {report.skipped.length}</span>
                  <span className="rounded border border-editor-border bg-editor-bg px-2 py-1">Failed: {report.failed.length}</span>
                </div>
                <div className="max-h-48 overflow-y-auto rounded border border-editor-border bg-editor-bg font-mono text-xs">
                  {(['imported', 'renamed', 'skipped', 'failed'] as const).flatMap((kind) => report[kind].map((entry) => (
                    <div key={`${kind}:${entry.sourcePath}`} className="border-b border-editor-border px-2 py-1.5 last:border-b-0">
                      <span className="mr-2 uppercase text-editor-muted">{kind}</span>
                      <span className="break-all">{entry.sourcePath}</span>
                      {entry.targetPath && entry.targetPath !== entry.sourcePath && (
                        <span className="break-all text-editor-muted"> → {entry.targetPath}</span>
                      )}
                      {entry.message && <div className="mt-0.5 break-words text-editor-muted">{entry.message}</div>}
                    </div>
                  )))}
                </div>
                {report.dryRun ? (
                  <button
                    type="button"
                    disabled={busy || importCount === 0 || report.failed.length > 0}
                    onClick={() => void handleImport()}
                    className="rounded bg-editor-accent px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-editor-active disabled:text-editor-muted"
                  >
                    {status === 'importing' ? 'Importing…' : `Confirm import (${importCount})`}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 font-medium">
                    <ShieldCheck size={16} />
                    Import complete: {reportCount(report)} files reported. Retrying the same source is safe.
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-lg border border-editor-border bg-editor-sidebar p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Download size={18} className="mt-0.5 shrink-0" />
              <div>
                <h2 className="font-semibold">Export all active notes</h2>
                <p className="mt-1 text-editor-muted">Downloads a ZIP with the folder hierarchy, note content, and a UUID/revision/timestamp manifest.</p>
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleExport()}
              className="shrink-0 rounded border border-editor-border bg-editor-bg px-3 py-2 font-medium hover:bg-editor-active disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'exporting' ? 'Preparing…' : 'Download ZIP'}
            </button>
          </section>

          {error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>}
        </div>
      </div>
    </div>
  );
};
