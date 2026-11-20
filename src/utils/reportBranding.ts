/// <reference types="vite/client" />
import { CompanyConfig } from "../types";

export const OFFICIAL_COMPANY_NAME = "ETHIOPIAN REINSURANCE S.C.";
export const OFFICIAL_COMPANY_LEGAL_NAME = "Ethiopian Reinsurance Share Company";
export const OFFICIAL_LOGO_RELATIVE_PATH = "assets/ethiore-logo.png";
export const RISING_WITH_AFRICA_MAP_RELATIVE_PATH = "assets/glossy-blue-africa-map.png";

/**
 * Resolves a static file inside public/ using Vite's configured BASE_URL
 * (/ in local development, /HRMS-Main/ in GitHub Pages production builds).
 */
export function getViteAssetUrl(relativePath: string): string {
  const rawBase = import.meta.env?.BASE_URL || "/";
  const normalizedBase = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;
  const cleanRelative = relativePath.replace(/^\/+/, "");
  return `${normalizedBase}${cleanRelative}`;
}

/**
 * Returns the Vite BASE_URL-aware URL for the bundled official Ethiopian Reinsurance S.C. logo.
 * Resolves to /assets/ethiore-logo.png in local dev and /HRMS-Main/assets/ethiore-logo.png on GitHub Pages.
 */
export function getOfficialLogoUrl(): string {
  return getViteAssetUrl(OFFICIAL_LOGO_RELATIVE_PATH);
}

/**
 * Returns the Vite BASE_URL-aware URL for the bundled Glossy Blue Africa Map emblem
 * displayed beside the "Rising with Africa" slogan in the sidebar.
 */
export function getRisingWithAfricaMapUrl(): string {
  return getViteAssetUrl(RISING_WITH_AFRICA_MAP_RELATIVE_PATH);
}

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
 * Uses the custom logo configured in Settings -> Branding Theme if set,
 * otherwise returns the bundled official Ethiopian Reinsurance S.C. logo.
 */
export function getCompanyLogoUrl(companyConfig?: CompanyConfig, overrideLogoUrl?: string): string {
  const candidate = (overrideLogoUrl ?? companyConfig?.profile?.logoUrl ?? "").trim();
  return candidate || getOfficialLogoUrl();
}

export function getDefaultEmblemDataUri(): string {
  return getOfficialLogoUrl();
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

async function fetchImageUrlAsDataUrl(targetUrl: string, allowProxyFallback: boolean): Promise<string> {
  if (targetUrl.startsWith("data:image/")) {
    return targetUrl;
  }

  let fetchedBlob: Blob | null = null;
  try {
    const isSameOrigin = targetUrl.startsWith("/") || targetUrl.startsWith(window.location.origin);
    const directRes = await fetch(targetUrl, isSameOrigin ? undefined : { mode: "cors" });
    if (directRes.ok) {
      const contentType = directRes.headers.get("content-type") || "";
      if (!contentType || contentType.startsWith("image/")) {
        fetchedBlob = await directRes.blob();
      }
    }
  } catch {
    // Fallback to proxy when allowed
  }

  if (!fetchedBlob && allowProxyFallback && /^https?:\/\//i.test(targetUrl)) {
    const proxyRes = await fetch(`/api/logo-proxy?url=${encodeURIComponent(targetUrl)}`);
    if (proxyRes.ok) {
      fetchedBlob = await proxyRes.blob();
    }
  }

  if (!fetchedBlob) {
    throw new Error(`Unable to load logo image from ${targetUrl}`);
  }

  return blobToDataUrl(fetchedBlob);
}

async function decodeToPdfLogo(dataUrl: string): Promise<LoadedReportLogo> {
  // Preserve native JPEG and RGBA PNG (including transparency & original dimensions)
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) {
    const img = await loadImageElement(dataUrl);
    return {
      dataUrl,
      format: "JPEG",
      width: img.naturalWidth || 153,
      height: img.naturalHeight || 200
    };
  }

  if (dataUrl.startsWith("data:image/png")) {
    const img = await loadImageElement(dataUrl);
    return {
      dataUrl,
      format: "PNG",
      width: img.naturalWidth || 153,
      height: img.naturalHeight || 200
    };
  }

  // Convert SVG / WebP / GIF -> high-resolution PNG preserving exact aspect ratio & alpha
  const scale = dataUrl.startsWith("data:image/svg+xml") ? 3 : 2;
  return rasterizeDataUrlToPng(dataUrl, scale);
}

/**
 * Loads the official company logo into a PDF-ready format preserving original proportions,
 * resolution, and transparency. Falls back gracefully to the bundled official logo if a custom URL fails.
 */
export async function loadReportLogoForPdf(logoUrl?: string): Promise<LoadedReportLogo> {
  const defaultOfficialUrl = getOfficialLogoUrl();
  const cleanUrl = (logoUrl || "").trim() || defaultOfficialUrl;
  const cached = pdfLogoCache.get(cleanUrl);
  if (cached) return cached;

  try {
    const isCustomExternal = cleanUrl !== defaultOfficialUrl && /^https?:\/\//i.test(cleanUrl);
    const dataUrl = await fetchImageUrlAsDataUrl(cleanUrl, isCustomExternal);
    const result = await decodeToPdfLogo(dataUrl);
    pdfLogoCache.set(cleanUrl, result);
    return result;
  } catch (err) {
    // Graceful fallback to bundled official logo when custom URL is invalid or unreachable
    if (cleanUrl !== defaultOfficialUrl) {
      const defaultCached = pdfLogoCache.get(defaultOfficialUrl);
      if (defaultCached) return defaultCached;
      const fallbackDataUrl = await fetchImageUrlAsDataUrl(defaultOfficialUrl, false);
      const fallbackResult = await decodeToPdfLogo(fallbackDataUrl);
      pdfLogoCache.set(defaultOfficialUrl, fallbackResult);
      return fallbackResult;
    }
    throw err;
  }
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
