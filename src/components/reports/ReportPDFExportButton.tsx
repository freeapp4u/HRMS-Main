import React, { useState } from "react";
import { FileDown, Loader2, AlertCircle, X } from "lucide-react";
import { CompanyConfig } from "../../types";
import { ReportExportPayload } from "../../utils/reportBranding";
import { generateReportPdf } from "../../utils/reportPdfGenerator";

export interface ReportPDFExportButtonProps {
  reportData: ReportExportPayload | (() => ReportExportPayload);
  companyConfig?: CompanyConfig;
  fileName?: string;
  orientation?: "portrait" | "landscape" | "auto";
  label?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  onError?: (message: string) => void;
}

export default function ReportPDFExportButton({
  reportData,
  companyConfig,
  fileName,
  orientation = "auto",
  label = "Export PDF",
  className,
  disabled = false,
  id,
  onError,
}: ReportPDFExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleExportPdf = async () => {
    if (isExporting || disabled) return;
    setIsExporting(true);
    setLocalError(null);
    try {
      const payload = typeof reportData === "function" ? reportData() : reportData;
      const resolvedOrientation =
        orientation !== "auto" ? orientation : payload.orientation || "auto";
      await generateReportPdf(
        { ...payload, orientation: resolvedOrientation },
        companyConfig,
        fileName
      );
    } catch (err: any) {
      const msg = err?.message || "Failed to generate PDF report. Please verify logo and report data.";
      if (onError) {
        onError(msg);
      } else {
        setLocalError(msg);
      }
      console.error("Report PDF generation error:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        id={id}
        onClick={handleExportPdf}
        disabled={disabled || isExporting}
        className={
          className ||
          "px-3 py-1.5 bg-rose-700 hover:bg-rose-800 disabled:opacity-60 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 shadow-2xs transition-colors whitespace-nowrap"
        }
        title="Download genuine A4 PDF report"
      >
        {isExporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        ) : (
          <FileDown className="h-3.5 w-3.5 shrink-0" />
        )}
        <span>{isExporting ? "Generating..." : label}</span>
      </button>

      {localError && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-[60] max-w-sm bg-rose-50 border border-rose-300 text-rose-900 px-3.5 py-2.5 rounded-lg shadow-lg text-xs flex items-start gap-2"
        >
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">PDF Export Failed</p>
            <p className="text-[11px] text-rose-800 mt-0.5">{localError}</p>
          </div>
          <button
            type="button"
            onClick={() => setLocalError(null)}
            className="text-rose-600 hover:text-rose-900 p-0.5"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
