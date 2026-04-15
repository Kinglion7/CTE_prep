import type { Env } from "./bindings";

function parseAllowedOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Returns CORS headers for allowed browser origins, or empty object for non-browser clients (no Origin). Null = reject. */
export function corsHeaders(
  request: Request,
  env: Pick<Env, "ALLOWED_ORIGINS">
): Record<string, string> | null {
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  if (allowed.length === 0) return null;

  const origin = request.headers.get("Origin");
  if (!origin) {
    return {};
  }
  if (!allowed.includes(origin)) {
    return null;
  }
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function jsonResponse(
  data: unknown,
  status: number,
  request: Request,
  env: Pick<Env, "ALLOWED_ORIGINS">
): Response {
  const c = corsHeaders(request, env);
  if (!c) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...c },
  });
}
