export type VerifyResult =
  | { ok: true; rotated: boolean }
  | { ok: false; error: string };

function getApiBase(): string {
  return import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
}

/** Validates access code against the Worker (KV-backed password). */
export async function verifyAccessCode(password: string): Promise<VerifyResult> {
  const base = getApiBase();
  if (!base) {
    return { ok: false, error: "VITE_API_URL is not configured." };
  }

  const res = await fetch(`${base}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: password.trim() }),
  });

  let data: { error?: string; ok?: boolean; rotated?: boolean };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return { ok: false, error: `HTTP ${res.status}` };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? (res.status === 401 ? "Invalid access code." : `Error (${res.status})`),
    };
  }

  if (data.ok) {
    return { ok: true, rotated: Boolean(data.rotated) };
  }

  return { ok: false, error: "Unexpected response" };
}

export function isApiBaseConfigured(): boolean {
  return Boolean(getApiBase().trim());
}
