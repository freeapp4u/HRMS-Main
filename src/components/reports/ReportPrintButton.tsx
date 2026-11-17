import React, { useState } from "react";
import { Printer, Loader2 } from "lucide-react";
import { CompanyConfig } from "../../types";
import { ReportExportPayload } from "../../utils/reportBranding";
import { printStructuredReport, printTargetElement } from "../../utils/reportPrint";

export interface ReportPrintButtonProps {
  targetRef?: React.RefObject<HTMLElement | null>;
  printData?: ReportExportPayload | (() => ReportExportPayload);
  companyConfig?: CompanyConfig;
  orientation?: "portrait" | "landscape" | "auto";
  columnCount?: number;
  label?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  onError?: (message: string) => void;
}

export default function ReportPrintButton({
  targetRef,
  printData,
  companyConfig,
  orientation = "auto",
  columnCount,
  label = "Print",
  className,
  disabled = false,
  id,
  onError,
}: ReportPrintButtonProps) {
  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrint = async () => {
    if (isPrinting || disabled) return;
    setIsPrinting(true);
    try {
      if (printData) {
        const payload = typeof printData === "function" ? printData() : printData;
        const resolvedOrientation =
          orientation !== "auto" ? orientation : payload.orientation || "auto";
        await printStructuredReport(
          { ...payload, orientation: resolvedOrientation },
          companyConfig
        );
      } else if (targetRef?.current) {
        await printTargetElement(targetRef.current, {
          orientation,
          columnCount,
        });
      } else {
        window.print();
      }
    } catch (err: any) {
      const msg = err?.message || "Unable to prepare report for printing.";
      if (onError) {
        onError(msg);
      } else {
        console.error("Report print error:", msg);
      }
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <button
      type="button"
      id={id}
      onClick={handlePrint}
      disabled={disabled || isPrinting}
      className={
        className ||
        "px-3 py-1.5 bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 shadow-2xs transition-colors whitespace-nowrap"
      }
      title="Open print preview for this report"
    >
      {isPrinting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
      ) : (
        <Printer className="h-3.5 w-3.5 shrink-0" />
      )}
      <span>{isPrinting ? "Preparing..." : label}</span>
    </button>
  );
}
