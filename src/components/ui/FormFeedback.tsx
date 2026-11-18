import React from "react";
import { AlertCircle, AlertTriangle } from "lucide-react";

/**
 * Helper to apply consistent validation border and background styling to inputs/selects/textareas.
 */
export function fieldInputClass(
  hasError: boolean,
  baseClass: string
): string {
  if (!hasError) return baseClass;
  return `${baseClass} border-rose-500 ring-1 ring-rose-500/30 bg-rose-50/40 focus:border-rose-600 focus:ring-rose-500`;
}

interface FormFieldErrorProps {
  error?: string;
  className?: string;
}

/**
 * Accessible field-level validation error message rendered directly below an invalid input.
 */
export function FormFieldError({ error, className = "" }: FormFieldErrorProps) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className={`mt-1 text-[11px] font-semibold text-rose-600 flex items-start gap-1 leading-snug animate-in fade-in duration-150 ${className}`}
    >
      <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
      <span>{error}</span>
    </p>
  );
}

interface ValidationSummaryProps {
  errors?: Record<string, string>;
  message?: string | null;
  title?: string;
  className?: string;
}

/**
 * Top-of-form validation & business-rule error summary banner.
 */
export function ValidationSummary({
  errors,
  message,
  title = "Please review the form before submitting",
  className = "",
}: ValidationSummaryProps) {
  const fieldMessages = errors
    ? Object.values(errors).filter((v): v is string => Boolean(v))
    : [];

  if (!message && fieldMessages.length === 0) return null;

  return (
    <div
      role="alert"
      className={`p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs space-y-1.5 animate-in fade-in duration-150 ${className}`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-extrabold text-rose-900">{title}</p>
          {message && <p className="text-[11px] font-semibold mt-0.5">{message}</p>}
          {fieldMessages.length > 0 && (
            <ul className="mt-1.5 list-disc list-inside space-y-0.5 text-[11px] font-medium text-rose-700">
              {fieldMessages.slice(0, 6).map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
              {fieldMessages.length > 6 && (
                <li>...and {fieldMessages.length - 6} more field(s) highlighted below.</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
