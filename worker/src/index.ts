import { handleAuthOptions, handleAuthVerify } from "./auth";
import type { Env } from "./bindings";
import { jsonResponse } from "./cors";
import {
  DCIPS_JSON_SYSTEM_INSTRUCTION_INDIVIDUAL,
  DCIPS_JSON_SYSTEM_INSTRUCTION_MULTIPLE,
} from "./prompt";

export type { Env };

type ExtractBody = { text?: string; reportFormat?: string };

type ReportFormat = "individual" | "multiple";

function parseReportFormat(raw: unknown): ReportFormat {
  return raw === "multiple" ? "multiple" : "individual";
}

function systemInstructionForFormat(format: ReportFormat): string {
  return format === "multiple"
    ? DCIPS_JSON_SYSTEM_INSTRUCTION_MULTIPLE
    : DCIPS_JSON_SYSTEM_INSTRUCTION_INDIVIDUAL;
}

const JSON_KEYS = [
  "Field_Report_Type",
  "Field_Report_Number",
  "Last_Name",
  "First_Name",
  "Middle_Name",
  "Suffix",
  "Inflicting_Force",
  "Casualty_Type_Status_Category",
  "SSN",
  "DoD_ID",
  "Personnel_Type",
  "Branch_of_Service",
  "Rank",
  "Military_Unit",
  "UIC",
  "Duty_Status",
  "Incident_Date_Time",
  "Country",
  "State",
  "Grid",
  "Operation",
  "Circumstances",
  "Date_of_Death_Time",
  "Death_Country",
  "Death_State",
  "Birth_Date",
  "Gender",
  "Remarks",
] as const;

function normalizeOneCasualty(rec: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of JSON_KEYS) {
    const v = rec[key];
    out[key] = v == null ? "" : String(v);
  }
  return out;
}

function parsePersonnelFromModelObject(obj: unknown): Record<string, string>[] {
  if (!obj || typeof obj !== "object") {
    throw new Error("Model returned non-object JSON");
  }
  const root = obj as Record<string, unknown>;
  const personnel = root.personnel;
  if (Array.isArray(personnel)) {
    if (personnel.length === 0) {
      throw new Error("personnel array is empty");
    }
    return personnel.map((p, i) => {
      if (!p || typeof p !== "object") {
        throw new Error(`personnel[${i}] must be an object`);
      }
      return normalizeOneCasualty(p as Record<string, unknown>);
    });
  }
  return [normalizeOneCasualty(root as Record<string, unknown>)];
}

function parseJsonFromModelText(partText: string): Record<string, string>[] {
  let obj: unknown;
  try {
    obj = JSON.parse(partText) as unknown;
  } catch {
    const m = partText.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Could not parse JSON from model");
    obj = JSON.parse(m[0]) as unknown;
  }
  return parsePersonnelFromModelObject(obj);
}

async function callGeminiJson(
  text: string,
  env: Env,
  systemInstruction: string
): Promise<Record<string, string>[]> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const model = env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  const body = {
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 55_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}: ${raw.slice(0, 400)}`);
  }

  let parsed: {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    error?: { message?: string };
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error("Invalid JSON from Gemini");
  }

  if (parsed.error?.message) {
    throw new Error(parsed.error.message);
  }

  const partText =
    parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!partText) {
    throw new Error("Empty model response");
  }

  return parseJsonFromModelText(partText);
}

async function callGrokJson(
  text: string,
  env: Env,
  systemInstruction: string
): Promise<Record<string, string>[]> {
  if (!env.GROK_API_KEY) {
    throw new Error("GROK_API_KEY not configured");
  }

  const model = env.GROK_MODEL || "grok-3";
  const url = "https://api.x.ai/v1/chat/completions";

  const basePayload = {
    model,
    temperature: 0.2,
    max_completion_tokens: 4096,
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: text },
    ],
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 55_000);

  let res: Response;
  let raw: string;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.GROK_API_KEY}`,
      },
      body: JSON.stringify({
        ...basePayload,
        response_format: { type: "json_object" as const },
      }),
      signal: controller.signal,
    });
    raw = await res.text();
    if (!res.ok && res.status === 400) {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.GROK_API_KEY}`,
        },
        body: JSON.stringify(basePayload),
        signal: controller.signal,
      });
      raw = await res.text();
    }
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    throw new Error(`Grok HTTP ${res.status}: ${raw.slice(0, 400)}`);
  }

  let parsed: {
    choices?: Array<{
      message?: { content?: string | null };
    }>;
    error?: { message?: string };
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error("Invalid JSON from Grok");
  }

  if (parsed.error?.message) {
    throw new Error(parsed.error.message);
  }

  const partText = parsed.choices?.[0]?.message?.content ?? "";
  if (!partText) {
    throw new Error("Empty Grok response");
  }

  return parseJsonFromModelText(partText);
}

async function extractDcipsWithFallback(
  text: string,
  env: Env,
  reportFormat: ReportFormat
): Promise<Record<string, string>[]> {
  const attempts: string[] = [];
  const systemInstruction = systemInstructionForFormat(reportFormat);

  if (env.GEMINI_API_KEY) {
    try {
      return await callGeminiJson(text, env, systemInstruction);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      attempts.push(`Gemini failed: ${msg}`);
    }
  }

  if (env.GROK_API_KEY) {
    try {
      return await callGrokJson(text, env, systemInstruction);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      attempts.push(`Grok failed: ${msg}`);
    }
  }

  if (!env.GEMINI_API_KEY && !env.GROK_API_KEY) {
    throw new Error("No LLM API keys configured (GEMINI_API_KEY or GROK_API_KEY)");
  }

  throw new Error(attempts.join(" | "));
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return handleAuthOptions(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/auth/verify") {
      return handleAuthVerify(request, env);
    }

    if (request.method !== "POST" || url.pathname !== "/api/extract") {
      return jsonResponse({ error: "Not found" }, 404, request, env);
    }

    if (!env.GEMINI_API_KEY && !env.GROK_API_KEY) {
      return jsonResponse(
        {
          error:
            "Server misconfigured: set GEMINI_API_KEY and/or GROK_API_KEY",
        },
        500,
        request,
        env
      );
    }

    let body: ExtractBody;
    try {
      body = (await request.json()) as ExtractBody;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, request, env);
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return jsonResponse({ error: "Field `text` is required" }, 400, request, env);
    }

    const reportFormat = parseReportFormat(body.reportFormat);

    try {
      let personnel = await extractDcipsWithFallback(text, env, reportFormat);
      if (reportFormat === "individual" && personnel.length > 1) {
        personnel = personnel.slice(0, 1);
      }
      return jsonResponse({ personnel }, 200, request, env);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isAbort = e instanceof Error && e.name === "AbortError";
      return jsonResponse(
        {
          error: isAbort ? "Extraction timed out" : "Extraction failed",
          detail: msg,
        },
        isAbort ? 504 : 502,
        request,
        env
      );
    }
  },
};
