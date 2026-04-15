import type {
  DcipsExtracted,
  DcipsExtractResponse,
  ReportFormat,
} from "../types/dcips";
import { DCIPS_KEYS, EMPTY_DCIPS } from "../types/dcips";

function getApiBase(): string {
  const base = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
  return base;
}

export type ExtractErrorBody = { error: string; detail?: string };

function rowFromUnknown(obj: Record<string, unknown>): DcipsExtracted {
  const out: DcipsExtracted = { ...EMPTY_DCIPS };
  for (const key of DCIPS_KEYS) {
    const v = obj[key];
    out[key] = v == null ? "" : String(v);
  }
  return out;
}

export async function extractDcips(
  text: string,
  reportFormat: ReportFormat
): Promise<DcipsExtractResponse> {
  const base = getApiBase();
  if (!base) {
    throw new Error("VITE_API_URL is not configured.");
  }

  const url = `${base}/api/extract`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, reportFormat }),
  });

  const raw = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(raw.slice(0, 200) || `HTTP ${res.status}`);
  }

  if (!res.ok) {
    const err = data as ExtractErrorBody;
    throw new Error(err.error || err.detail || `HTTP ${res.status}`);
  }

  const obj = data as Record<string, unknown>;
  if (!obj || typeof obj !== "object") {
    throw new Error("Invalid response from server.");
  }

  const personnelRaw = obj.personnel;
  if (Array.isArray(personnelRaw)) {
    if (personnelRaw.length === 0) {
      throw new Error("Extraction returned no personnel.");
    }
    const personnel: DcipsExtracted[] = personnelRaw.map((row, i) => {
      if (!row || typeof row !== "object") {
        throw new Error(`Invalid personnel[${i}] in response.`);
      }
      return rowFromUnknown(row as Record<string, unknown>);
    });
    return { personnel };
  }

  const legacy = rowFromUnknown(obj);
  return { personnel: [legacy] };
}
