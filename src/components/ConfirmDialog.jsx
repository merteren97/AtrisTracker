import React, { useEffect, useRef } from 'react';
import { TriangleAlert, X } from 'lucide-react';

export default function ConfirmDialog({
  open = false,
  title = 'Onay',
  message = '',
  confirmLabel = 'Onayla',
  cancelLabel = 'Vazgeç',
  danger = true,
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel?.();
      if (event.key === 'Enter') onConfirm?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => confirmRef.current?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] px-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-[300px] max-w-full rounded-xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10 bg-slate-950/60">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`p-1 rounded-md shrink-0 ${danger ? 'bg-red-950/40' : 'bg-amber-950/40'}`}>
              <TriangleAlert className={`w-3 h-3 ${danger ? 'text-red-400' : 'text-amber-300'}`} />
            </div>
            <span className="text-[11px] font-semibold text-slate-100 truncate">{title}</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-800 shrink-0"
            aria-label="Kapat"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        <div className="px-3 py-3">
          <p className="text-[11px] text-slate-300 leading-relaxed break-words">{message}</p>
        </div>

        <div className="flex items-center justify-end gap-1.5 px-3 py-2.5 border-t border-white/10 bg-slate-950/40">
          <button
            type="button"
            onClick={onCancel}
            className="px-2.5 py-1 rounded-lg text-[10px] font-medium text-slate-300 border border-white/10 bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white transition-colors ${
              danger
                ? 'bg-red-600/80 hover:bg-red-600'
                : 'bg-cyan-600/80 hover:bg-cyan-600'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
