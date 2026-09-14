import React, { useEffect, useState } from 'react';
import { FileText, Folder, RotateCcw, Trash2, X } from 'lucide-react';
import type { DeletedNode } from '../../shared/contracts.ts';

interface TrashModalProps {
  isOpen: boolean;
  items: DeletedNode[];
  onRestore: (item: DeletedNode) => Promise<void>;
  onClose: () => void;
}

export const TrashModal: React.FC<TrashModalProps> = ({ isOpen, items, onRestore, onClose }) => {
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const restore = async (item: DeletedNode) => {
    setRestoringId(item.id);
    try {
      await onRestore(item);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 font-sans text-sm text-editor-text" onClick={onClose}>
      <div className="flex max-h-[75dvh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-editor-border bg-editor-bg shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-editor-border bg-editor-sidebar px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <Trash2 size={16} />
            <span>Recover deleted items</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close trash" className="rounded p-1 text-editor-muted hover:bg-editor-active hover:text-editor-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-muted">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-editor-border">
          {items.length === 0 ? (
            <div className="p-8 text-center text-editor-muted">Trash is empty.</div>
          ) : items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                {item.type === 'directory' ? <Folder size={15} className="shrink-0 text-editor-muted" /> : <FileText size={15} className="shrink-0 text-editor-muted" />}
                <div className="min-w-0">
                  <div className="truncate font-medium">{item.name}</div>
                  <div className="text-xs text-editor-muted">Deleted {new Date(item.deletedAt).toLocaleString()}</div>
                </div>
              </div>
              <button
                type="button"
                disabled={restoringId !== null}
                onClick={() => restore(item)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded border border-editor-border px-3 py-1.5 font-medium hover:bg-editor-active disabled:cursor-wait disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editor-muted"
              >
                <RotateCcw size={14} />
                {restoringId === item.id ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
