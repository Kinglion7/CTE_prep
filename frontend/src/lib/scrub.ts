/** Mask SSN-like and DOB-like patterns before sending text to the Worker. */

const SSN_PATTERN =
  /\b(\d{3}[-\s]?\d{2}[-\s]?\d{4})\b|\b(\d{9})\b(?![\d])/g;

const DOB_PATTERN =
  /\b(?:DOB|D\.O\.B\.|Date of Birth|Birth Date)\s*[:#]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})/gi;

export function scrubNarrativeForNetwork(text: string): string {
  let out = text;
  out = out.replace(SSN_PATTERN, "[SSN REDACTED]");
  out = out.replace(DOB_PATTERN, (m) => m.replace(/\d[\d/-]+/g, "[DOB REDACTED]"));
  return out;
}
