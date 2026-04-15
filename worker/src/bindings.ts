export interface Env {
  GEMINI_API_KEY?: string;
  GROK_API_KEY?: string;
  ALLOWED_ORIGINS: string;
  GEMINI_MODEL: string;
  GROK_MODEL?: string;
  DCIPS_AUTH: KVNamespace;
}
