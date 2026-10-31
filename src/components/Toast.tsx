import React from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  description?: string;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => {
        const icon =
          toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          ) : toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          ) : toast.type === 'warning' ? (
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          ) : (
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          );

        const borderBg =
          toast.type === 'success'
            ? 'border-emerald-200/80 bg-white'
            : toast.type === 'error'
            ? 'border-rose-200/80 bg-white'
            : toast.type === 'warning'
            ? 'border-amber-200/80 bg-white'
            : 'border-blue-200/80 bg-white';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-lg shadow-slate-900/5 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 ${borderBg}`}
          >
            {icon}
            <div className="flex-1 min-w-0">
              <h5 className="text-xs font-semibold text-slate-900 tracking-tight">
                {toast.title}
              </h5>
              {toast.description && (
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed break-words">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 rounded cursor-pointer shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
