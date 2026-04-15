import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  isApiBaseConfigured,
  verifyAccessCode,
} from "./lib/authGate";

const STORAGE_KEY = "dcips_gate_ok";

function readUnlocked(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const inputClass =
  "focus-ring w-full rounded-lg border border-border bg-white px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

const btnPrimaryClass =
  "focus-ring inline-flex w-full items-center justify-center rounded-lg bg-accent px-6 py-3.5 font-heading text-sm font-semibold uppercase tracking-wider text-accent-foreground transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50";

export function PasswordGate({ children }: { children: ReactNode }) {
  const apiConfigured = isApiBaseConfigured();
  const [unlocked, setUnlocked] = useState(readUnlocked);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rotationBanner, setRotationBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!rotationBanner) return;
    const t = window.setTimeout(() => setRotationBanner(null), 16_000);
    return () => window.clearTimeout(t);
  }, [rotationBanner]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!apiConfigured) {
      setError("Configure VITE_API_URL first.");
      return;
    }
    setLoading(true);
    setError("");
    const result = await verifyAccessCode(password);
    setLoading(false);
    if (result.ok) {
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        /* ignore */
      }
      if (result.rotated) {
        setRotationBanner(
          "Access code was updated on the server. New visitors must use the new code; the previous default no longer works."
        );
      }
      setUnlocked(true);
      setPassword("");
      return;
    }
    setError(result.error);
  };

  if (unlocked) {
    return (
      <>
        {rotationBanner ? (
          <div
            className="border-b border-border bg-amber-50 px-4 py-3 text-center text-sm text-foreground"
            role="status"
          >
            {rotationBanner}
          </div>
        ) : null}
        {children}
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 font-body text-foreground">
      <div className="card-military w-full max-w-md shadow-lg">
        <div className="military-header">Access required</div>
        <form className="card-military-body space-y-4" onSubmit={(e) => void onSubmit(e)}>
          {!apiConfigured ? (
            <p className="text-sm text-status-danger">
              Set <code>VITE_API_URL</code> to your Worker URL (e.g. in{" "}
              <code>.env.local</code>) and restart the dev server.
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-foreground">
              Enter the access code. Verification is checked against the server.
            </p>
          )}
          <label className="block">
            <span className="mb-2 block font-heading text-xs font-semibold uppercase tracking-wider text-accent">
              Access code
            </span>
            <input
              type="password"
              autoComplete="current-password"
              className={inputClass}
              value={password}
              disabled={loading || !apiConfigured}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              placeholder="Enter access code"
            />
          </label>
          {error ? (
            <p className="text-sm text-status-danger" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className={btnPrimaryClass}
            disabled={loading || !apiConfigured}
          >
            {loading ? "…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
