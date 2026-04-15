import type { Env } from "./bindings";
import { corsHeaders, jsonResponse } from "./cors";

/** KV key storing the current gate password (server-side only). */
const KV_PASSWORD_KEY = "gate_password_v1";

/** Used when KV has no value yet (first deploy). */
const DEFAULT_PASSWORD = "Bravo";

/**
 * Entering this code updates the stored password to PASSWORD_AFTER_ROTATION for all users.
 * Values exist only on the Worker, not in the frontend bundle.
 */
const ROTATION_TRIGGER = "585194";
const PASSWORD_AFTER_ROTATION = "onemoreday";

async function getStoredPassword(env: Env): Promise<string> {
  const v = await env.DCIPS_AUTH.get(KV_PASSWORD_KEY);
  return v ?? DEFAULT_PASSWORD;
}

export async function handleAuthVerify(
  request: Request,
  env: Env
): Promise<Response> {
  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, request, env);
  }

  const input = typeof body.password === "string" ? body.password.trim() : "";
  if (!input) {
    return jsonResponse(
      { error: "Field `password` is required" },
      400,
      request,
      env
    );
  }

  const current = await getStoredPassword(env);

  if (input === ROTATION_TRIGGER) {
    await env.DCIPS_AUTH.put(KV_PASSWORD_KEY, PASSWORD_AFTER_ROTATION);
    return jsonResponse({ ok: true, rotated: true }, 200, request, env);
  }

  if (input === current) {
    return jsonResponse({ ok: true, rotated: false }, 200, request, env);
  }

  return jsonResponse({ error: "Invalid access code" }, 401, request, env);
}

export function handleAuthOptions(request: Request, env: Env): Response {
  const c = corsHeaders(request, env);
  if (!c) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: c });
}
