import React, { createContext, useCallback, useContext, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type ToastType = "error" | "warning" | "success" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string, title?: string) => void;
  showError: (message: string, title?: string) => void;
  showWarning: (message: string, title?: string) => void;
  showSuccess: (message: string, title?: string) => void;
  showInfo: (message: string, title?: string) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Safe no-op fallback if ever rendered outside provider in isolated unit tests
    return {
      showToast: () => {},
      showError: () => {},
      showWarning: () => {},
      showSuccess: () => {},
      showInfo: () => {},
      dismissToast: () => {},
    };
  }
  return ctx;
}

interface SingleToastProps {
  title?: string;
  message: string;
  onClose?: () => void;
}

export function ErrorToast({ title = "Error", message, onClose }: SingleToastProps) {
  return (
    <div
      role="alert"
      className="bg-rose-50 border border-rose-300 text-rose-900 rounded-xl shadow-lg p-3.5 flex items-start gap-2.5 animate-in slide-in-from-right-4 duration-200 pointer-events-auto"
    >
      <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-extrabold text-rose-950">{title}</p>
        <p className="text-[11px] font-medium text-rose-800 mt-0.5 leading-snug break-words">{message}</p>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-rose-500 hover:text-rose-800 p-0.5 rounded shrink-0"
          aria-label="Dismiss error notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function WarningToast({ title = "Warning", message, onClose }: SingleToastProps) {
  return (
    <div
      role="status"
      className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl shadow-lg p-3.5 flex items-start gap-2.5 animate-in slide-in-from-right-4 duration-200 pointer-events-auto"
    >
      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-extrabold text-amber-950">{title}</p>
        <p className="text-[11px] font-medium text-amber-800 mt-0.5 leading-snug break-words">{message}</p>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-amber-600 hover:text-amber-900 p-0.5 rounded shrink-0"
          aria-label="Dismiss warning notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function SuccessToast({ title = "Success", message, onClose }: SingleToastProps) {
  return (
    <div
      role="status"
      className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl shadow-lg p-3.5 flex items-start gap-2.5 animate-in slide-in-from-right-4 duration-200 pointer-events-auto"
    >
      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-extrabold text-emerald-950">{title}</p>
        <p className="text-[11px] font-medium text-emerald-800 mt-0.5 leading-snug break-words">{message}</p>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-emerald-600 hover:text-emerald-900 p-0.5 rounded shrink-0"
          aria-label="Dismiss success notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function InfoToast({ title = "Notice", message, onClose }: SingleToastProps) {
  return (
    <div
      role="status"
      className="bg-sky-50 border border-sky-300 text-sky-900 rounded-xl shadow-lg p-3.5 flex items-start gap-2.5 animate-in slide-in-from-right-4 duration-200 pointer-events-auto"
    >
      <Info className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-extrabold text-sky-950">{title}</p>
        <p className="text-[11px] font-medium text-sky-800 mt-0.5 leading-snug break-words">{message}</p>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-sky-600 hover:text-sky-900 p-0.5 rounded shrink-0"
          aria-label="Dismiss info notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((type: ToastType, message: string, title?: string) => {
    const id = `TOAST_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-4), { id, type, message, title }]);
    const duration = type === "error" ? 7000 : type === "warning" ? 5500 : 4500;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const showError = useCallback(
    (message: string, title = "Action Required") => showToast("error", message, title),
    [showToast]
  );
  const showWarning = useCallback(
    (message: string, title = "Validation Warning") => showToast("warning", message, title),
    [showToast]
  );
  const showSuccess = useCallback(
    (message: string, title = "Completed") => showToast("success", message, title),
    [showToast]
  );
  const showInfo = useCallback(
    (message: string, title = "Information") => showToast("info", message, title),
    [showToast]
  );

  return (
    <ToastContext.Provider
      value={{ showToast, showError, showWarning, showSuccess, showInfo, dismissToast }}
    >
      {children}
      {/* Global Notification Stack */}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 z-[100] w-full max-w-sm space-y-2 pointer-events-none px-4 sm:px-0 print:hidden"
      >
        {toasts.map((toast) => {
          if (toast.type === "error") {
            return (
              <div key={toast.id}>
                <ErrorToast
                  title={toast.title}
                  message={toast.message}
                  onClose={() => dismissToast(toast.id)}
                />
              </div>
            );
          }
          if (toast.type === "warning") {
            return (
              <div key={toast.id}>
                <WarningToast
                  title={toast.title}
                  message={toast.message}
                  onClose={() => dismissToast(toast.id)}
                />
              </div>
            );
          }
          if (toast.type === "success") {
            return (
              <div key={toast.id}>
                <SuccessToast
                  title={toast.title}
                  message={toast.message}
                  onClose={() => dismissToast(toast.id)}
                />
              </div>
            );
          }
          return (
            <div key={toast.id}>
              <InfoToast
                title={toast.title}
                message={toast.message}
                onClose={() => dismissToast(toast.id)}
              />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// ======================================================
// Reusable Confirmation Dialog (replaces window.confirm)
// ======================================================

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "primary";
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const headerClass =
    variant === "danger"
      ? "bg-rose-600 text-white"
      : variant === "warning"
      ? "bg-amber-600 text-white"
      : "bg-primary-custom text-white";

  const confirmBtnClass =
    variant === "danger"
      ? "bg-rose-600 hover:bg-rose-700 text-white"
      : variant === "warning"
      ? "bg-amber-600 hover:bg-amber-700 text-white"
      : "bg-primary-custom hover:opacity-90 text-white";

  return (
    <div
      className="fixed inset-0 bg-black/55 backdrop-blur-[1px] flex items-center justify-center z-[90] p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
        <div className={`${headerClass} px-5 py-3.5 flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <h3 className="font-extrabold text-xs uppercase tracking-wider">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="text-white/80 hover:text-white disabled:opacity-50"
            aria-label="Close confirmation dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-xs text-slate-700 leading-relaxed">{message}</div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`px-4 py-2 text-xs font-extrabold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 ${confirmBtnClass}`}
            >
              {isLoading && (
                <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              <span>{confirmText}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
