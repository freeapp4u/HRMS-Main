import { CompanyConfig } from "../types";

export const OFFICIAL_COMPANY_NAME = "ETHIOPIAN REINSURANCE S.C.";
export const OFFICIAL_COMPANY_LEGAL_NAME = "Ethiopian Reinsurance Share Company";

/**
 * Official Ethio-Re vector emblem matching the application sidebar badge.
 * Used only when no custom logo URL is uploaded in Settings -> Branding Theme.
 */
export const ETHIO_RE_EMBLEM_SVG = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ethioReRing" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#009A44" />
      <stop offset="50%" stop-color="#FED100" />
      <stop offset="100%" stop-color="#E62529" />
    </linearGradient>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#ethioReRing)" />
  <circle cx="60" cy="60" r="51" fill="#002B5B" stroke="#FFFFFF" stroke-width="2" />
  <g transform="translate(10,10)" fill="#FED100">
    <path d="M 27,20 C 33,18 42,17 52,18 C 60,19 67,17 76,21 C 80,23 77,28 74,32 C 73,36 78,39 83,42 C 88,45 89,50 85,54 C 81,58 76,60 74,64 C 72,68 66,75 62,81 C 57,87 52,89 47,86 C 44,82 46,75 44,71 C 42,67 38,64 35,60 C 31,59 27,59 23,57 C 18,54 15,49 14,44 C 13,38 16,33 20,29 C 23,26 25,23 27,20 Z" />
    <path d="M 81,64 C 83,66 85,72 83,78 C 81,78 79,72 81,64 Z" />
  </g>
</svg>`;

export interface ReportColumn {
  header: string;
  align?: "left" | "center" | "right";
  widthWeight?: number;
}

export interface ReportMetric {
  label: string;
  value: string;
}

export interface ReportAdditionalTable {
  title: string;
  columns: ReportColumn[];
  rows: (string | number)[][];
  totalsRow?: (string | number)[];
}

export interface PayslipReportData {
  employeeName: string;
  employeeId: string;
  position: string;
  department: string;
  periodName: string;
  paymentDate: string;
  refNo: string;
  earnings: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
  employerPension: number;
  currency?: string;
}

export interface ReportExportPayload {
  reportTitle: string;
  filePrefix: string;
  reportSubtitle?: string;
  reportingPeriod?: string;
  departmentOrUnit?: string;
  generatedAt?: string;
  generatedBy?: string;
  referenceNo?: string;
  extraMeta?: { label: string; value: string }[];
  summaryMetrics?: ReportMetric[];
  columns: ReportColumn[];
  rows: (string | number)[][];
  totalsRow?: (string | number)[];
  emptyMessage?: string;
  orientation?: "portrait" | "landscape" | "auto";
  additionalTables?: ReportAdditionalTable[];
  payslipData?: PayslipReportData;
}

export interface LoadedReportLogo {
  dataUrl: string;
  format: "PNG" | "JPEG";
  width: number;
  height: number;
}

/**
 * Centralized company logo source resolver.
 */
export function getCompanyLogoUrl(companyConfig?: CompanyConfig, overrideLogoUrl?: string): string {
  const candidate = (overrideLogoUrl ?? companyConfig?.profile?.logoUrl ?? "").trim();
  return candidate;
}

export function getDefaultEmblemDataUri(): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ETHIO_RE_EMBLEM_SVG)}`;
}

export function formatReportDateTime(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function getReportDateStamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function buildReportFileName(filePrefix: string, extension = "pdf"): string {
  const safePrefix = filePrefix
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${safePrefix || "ETRHRMS_Report"}_${getReportDateStamp()}.${extension}`;
}

export function resolveReportOrientation(
  requested: "portrait" | "landscape" | "auto" | undefined,
  columnCount: number
): "portrait" | "landscape" {
  if (requested === "portrait" || requested === "landscape") {
    return requested;
  }
  return columnCount >= 7 ? "landscape" : "portrait";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read image data URL"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to convert image blob"));
    reader.readAsDataURL(blob);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode company logo image"));
    img.src = src;
  });
}

async function rasterizeDataUrlToPng(dataUrl: string, targetScale = 2): Promise<LoadedReportLogo> {
  const img = await loadImageElement(dataUrl);
  const naturalW = img.naturalWidth || 240;
  const naturalH = img.naturalHeight || 240;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(120, Math.round(naturalW * targetScale));
  canvas.height = Math.max(120, Math.round(naturalH * targetScale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable for logo rendering");
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    format: "PNG",
    width: naturalW,
    height: naturalH
  };
}

const pdfLogoCache = new Map<string, LoadedReportLogo>();

/**
 * Loads the official company logo as a rasterized Data URL preserving original proportions and quality.
 * Falls back to the server proxy for Firebase Storage URLs without CORS headers, and to the
 * official Ethio-Re vector emblem only when no custom logoUrl is configured.
 */
export async function loadReportLogoForPdf(logoUrl?: string): Promise<LoadedReportLogo> {
  const cleanUrl = (logoUrl || "").trim();
  const cacheKey = cleanUrl || "__DEFAULT_ETHIORE_EMBLEM__";
  const cached = pdfLogoCache.get(cacheKey);
  if (cached) return cached;

  if (!cleanUrl) {
    const fallback = await rasterizeDataUrlToPng(getDefaultEmblemDataUri(), 3);
    pdfLogoCache.set(cacheKey, fallback);
    return fallback;
  }

  let dataUrl = cleanUrl;
  if (!cleanUrl.startsWith("data:image/")) {
    let fetchedBlob: Blob | null = null;
    try {
      const directRes = await fetch(cleanUrl, { mode: "cors" });
      if (directRes.ok) {
        fetchedBlob = await directRes.blob();
      }
    } catch {
      // Fallback to same-origin server proxy when Firebase Storage CORS is not enabled
    }

    if (!fetchedBlob) {
      const proxyRes = await fetch(`/api/logo-proxy?url=${encodeURIComponent(cleanUrl)}`);
      if (!proxyRes.ok) {
        throw new Error(`Unable to load configured company logo (${proxyRes.status}).`);
      }
      fetchedBlob = await proxyRes.blob();
    }

    dataUrl = await blobToDataUrl(fetchedBlob);
  }

  // Convert SVG/WebP or normalize PNG/JPEG while preserving exact natural aspect ratio
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) {
    const img = await loadImageElement(dataUrl);
    const result: LoadedReportLogo = {
      dataUrl,
      format: "JPEG",
      width: img.naturalWidth || 200,
      height: img.naturalHeight || 200
    };
    pdfLogoCache.set(cacheKey, result);
    return result;
  }

  if (dataUrl.startsWith("data:image/png")) {
    const img = await loadImageElement(dataUrl);
    const result: LoadedReportLogo = {
      dataUrl,
      format: "PNG",
      width: img.naturalWidth || 200,
      height: img.naturalHeight || 200
    };
    pdfLogoCache.set(cacheKey, result);
    return result;
  }

  // SVG / WebP / GIF -> crisp PNG preserving original ratio
  const scale = dataUrl.startsWith("data:image/svg+xml") ? 3 : 1;
  const converted = await rasterizeDataUrlToPng(dataUrl, scale);
  pdfLogoCache.set(cacheKey, converted);
  return converted;
}

/**
 * Waits for all images (especially the company logo) inside a DOM container to complete loading.
 */
export async function preloadDomImages(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => {
            img.removeEventListener("load", done);
            img.removeEventListener("error", done);
            resolve();
          };
          img.addEventListener("load", done);
          img.addEventListener("error", done);
          setTimeout(done, 4000);
        })
    )
  );
}
