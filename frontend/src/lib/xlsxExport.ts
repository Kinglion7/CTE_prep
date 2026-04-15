import * as XLSX from "xlsx";
import type { DcipsExtracted, ReportFormat } from "../types/dcips";

const INDIVIDUAL_SHEET = "CASUALTY";
const MULTIPLE_SHEET = "CASUALTIES";
/** 0-based row index of first data row on CASUALTIES (Excel row 9). */
const MULTIPLE_DATA_START_ROW = 8;

/** Preserve fills, borders, and formats from the official DCIPS templates on round-trip. */
const READ_OPTS: XLSX.ParsingOptions = {
  type: "array",
  cellStyles: true,
};

/** Emit cell styles when present (pairs with READ_OPTS). */
const WRITE_OPTS: XLSX.WritingOptions = {
  bookType: "xlsx",
  type: "array",
  cellStyles: true,
};

function readWorkbookFromArrayBuffer(buf: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(buf, READ_OPTS);
}

/** Writes a string cell while keeping the template’s style (`s`) and number format (`z`) when known. */
function setStringCellPreservingLook(
  ws: XLSX.WorkSheet,
  r: number,
  c: number,
  val: string,
  stylePrototype?: XLSX.CellObject
): void {
  const addr = XLSX.utils.encode_cell({ r, c });
  const existing = ws[addr];
  const proto = existing ?? stylePrototype;
  const next: XLSX.CellObject = { t: "s", v: val };
  if (proto?.s != null) next.s = proto.s;
  if (proto?.z != null) next.z = proto.z;
  ws[addr] = next;
}

const LABEL_TO_JSON_KEY: Record<string, keyof DcipsExtracted> = {
  "Field Report Type": "Field_Report_Type",
  "Field Report Number": "Field_Report_Number",
  "Last Name": "Last_Name",
  "First Name": "First_Name",
  "Middle Name": "Middle_Name",
  Suffix: "Suffix",
  "Inflicting Force": "Inflicting_Force",
  "Casualty Type - Status - Category": "Casualty_Type_Status_Category",
  "Social Security #": "SSN",
  "DoD ID": "DoD_ID",
  "Personnel Type - Affiliation - Category": "Personnel_Type",
  "Branch of Service": "Branch_of_Service",
  Rank: "Rank",
  "Military Unit of Assignment": "Military_Unit",
  "UIC/PAS": "UIC",
  "Duty Status": "Duty_Status",
  "Incident Date and Time": "Incident_Date_Time",
  Country: "Country",
  State: "State",
  Grid: "Grid",
  Operation: "Operation",
  "Circumstances (max 4000 characters)": "Circumstances",
  "Date of Death and Time": "Date_of_Death_Time",
  "Death Country": "Death_Country",
  "Death State": "Death_State",
  "Birth Date": "Birth_Date",
  Gender: "Gender",
  "Remarks  (max 4000 characters)": "Remarks",
};

export async function loadIndividualTemplateWorkbook(): Promise<XLSX.WorkBook> {
  const res = await fetch(`${import.meta.env.BASE_URL}DCIPS_Template.xlsx`);
  if (!res.ok) throw new Error(`Failed to load template (${res.status})`);
  const buf = await res.arrayBuffer();
  return readWorkbookFromArrayBuffer(buf);
}

/** @deprecated Use loadIndividualTemplateWorkbook */
export const loadTemplateWorkbook = loadIndividualTemplateWorkbook;

export async function loadMultipleTemplateWorkbook(): Promise<XLSX.WorkBook> {
  const res = await fetch(`${import.meta.env.BASE_URL}DCIPS_Multiple_Template.xlsx`);
  if (!res.ok) throw new Error(`Failed to load multiple template (${res.status})`);
  const buf = await res.arrayBuffer();
  return readWorkbookFromArrayBuffer(buf);
}

export function applyExtractedToWorkbook(
  wb: XLSX.WorkBook,
  extracted: DcipsExtracted
): void {
  const ws = wb.Sheets[INDIVIDUAL_SHEET];
  if (!ws) {
    throw new Error(`Sheet "${INDIVIDUAL_SHEET}" not found in template.`);
  }

  const fieldMap: Record<string, string> = {};
  for (const [label, jsonKey] of Object.entries(LABEL_TO_JSON_KEY)) {
    const v = extracted[jsonKey];
    if (v) fieldMap[label] = v;
  }

  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let r = range.s.r; r <= range.e.r; r++) {
    const addrA = XLSX.utils.encode_cell({ r, c: 0 });
    const cellA = ws[addrA];
    if (!cellA || cellA.v == null) continue;
    const label = String(cellA.v).trim();
    if (Object.prototype.hasOwnProperty.call(fieldMap, label)) {
      const addrB = XLSX.utils.encode_cell({ r, c: 1 });
      setStringCellPreservingLook(ws, r, 1, fieldMap[label], ws[addrB]);
    }
  }
}

function branchToService(branch: string): string {
  const map: Record<string, string> = {
    Army: "USA",
    Marine_Corps: "USMC",
    Navy: "USN",
    Air_Force: "USAF",
    Space_Force: "USSF",
  };
  return map[branch.trim()] ?? "";
}

function inflictingForceToMultiple(full: string): string {
  const map: Record<string, string> = {
    "Enemy Forces": "Enemy",
    "Allied Forces (Amigo)": "Ally",
    "U.S. Forces (Buddy)": "U.S.",
    Unknown: "Unknown",
    "Not Applicable": "",
  };
  return map[full.trim()] ?? "";
}

function personnelTypeToShort(full: string): string {
  if (!full.trim()) return "";
  if (/^Regular-/i.test(full)) return "Regular";
  if (/^Guard-/i.test(full)) return "Guard";
  if (/^Reserve-/i.test(full)) return "Reserve";
  if (/Civilian/i.test(full)) return "Civilian";
  if (/Contractor/i.test(full)) return "Contractor";
  if (/Military/i.test(full)) return "Military";
  return "Regular";
}

/** Maps full DCIPS Casualty_Type_Status_Category to Multiple Report short codes (template SELECTION_CHOICES). */
function casualtyTypeToMultipleCode(full: string): string {
  const f = full.trim();
  if (!f) return "";

  const exact: Record<string, string> = {
    "Hostile-Deceased-Killed In Action": "KIA",
    "Hostile-Deceased-Died of Wounds": "KIA",
    "Hostile-DUSTWUN-Pending": "DUSTWUN",
    "Hostile-VSI Ill/Injury-Wounded In Action": "NON-HOSTILE-INJURED-ILL",
    "Hostile-SI Ill/Injury-Wounded In Action": "WIA",
    "Hostile-NSI Ill/Injury-Wounded In Action": "WIA",
    "Nonhostile-Deceased-Accident": "NON-HOSTILE-DECEASED",
    "Nonhostile-Deceased-Homicide": "NON-HOSTILE-DECEASED",
    "Nonhostile-Deceased-Illness": "NON-HOSTILE-DECEASED",
    "Nonhostile-Deceased-Pending": "NON-HOSTILE-DECEASED",
    "Nonhostile-Deceased-Self-Inflicted": "NON-HOSTILE-DECEASED",
    "Nonhostile-Deceased-Undetermined": "NON-HOSTILE-DECEASED",
    "Nonhostile-NSI Ill/Injury-Illness": "NON-HOSTILE-INJURED-ILL",
    "Nonhostile-NSI Ill/Injury-Accident": "NON-HOSTILE-INJURED-ILL",
  };
  if (exact[f]) return exact[f];

  if (/Hostile-DUSTWUN/i.test(f)) return "DUSTWUN";
  if (/Killed In Action/i.test(f)) return "KIA";
  if (/Deceased-Died of Wounds/i.test(f)) return "KIA";
  if (/Hostile.*Wounded In Action/i.test(f)) return "WIA";
  if (/Nonhostile.*Deceased/i.test(f)) return "NON-HOSTILE-DECEASED";
  if (/Nonhostile.*Ill/i.test(f) || /Ill\/Injury/i.test(f)) return "NON-HOSTILE-INJURED-ILL";
  if (/Deceased/i.test(f)) return "NON-HOSTILE-DECEASED";
  return "WIA";
}

function buildIncidentLocation(e: DcipsExtracted): string {
  const parts = [e.Grid?.trim(), e.State?.trim(), e.Country?.trim()].filter(Boolean);
  return parts.join(", ");
}

/** Writes one row per casualty to sheet CASUALTIES (headers on Excel row 8). */
export function applyMultiplePersonnelToWorkbook(
  wb: XLSX.WorkBook,
  personnel: DcipsExtracted[]
): void {
  const ws = wb.Sheets[MULTIPLE_SHEET];
  if (!ws) {
    throw new Error(`Sheet "${MULTIPLE_SHEET}" not found in multiple template.`);
  }

  const maxCol = 13;
  const columnPrototypes: (XLSX.CellObject | undefined)[] = [];
  for (let c = 0; c <= maxCol; c++) {
    const addr = XLSX.utils.encode_cell({ r: MULTIPLE_DATA_START_ROW, c });
    columnPrototypes[c] = ws[addr];
  }

  personnel.forEach((e, i) => {
    const r = MULTIPLE_DATA_START_ROW + i;
    const row: string[] = [
      e.DoD_ID,
      e.Last_Name,
      e.First_Name,
      e.Middle_Name,
      casualtyTypeToMultipleCode(e.Casualty_Type_Status_Category),
      inflictingForceToMultiple(e.Inflicting_Force),
      branchToService(e.Branch_of_Service),
      personnelTypeToShort(e.Personnel_Type),
      e.Military_Unit,
      e.Incident_Date_Time,
      buildIncidentLocation(e),
      e.Circumstances,
      "",
      "",
    ];
    row.forEach((val, c) => {
      setStringCellPreservingLook(ws, r, c, val, columnPrototypes[c]);
    });
  });

  const maxR = MULTIPLE_DATA_START_ROW + personnel.length - 1;
  const prevRef = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  prevRef.e.r = Math.max(prevRef.e.r, maxR);
  prevRef.e.c = Math.max(prevRef.e.c, 13);
  ws["!ref"] = XLSX.utils.encode_range(prevRef);
}

export async function buildPopulatedWorkbook(
  personnel: DcipsExtracted[],
  reportFormat: ReportFormat
): Promise<XLSX.WorkBook> {
  if (personnel.length === 0) {
    throw new Error("No personnel to export.");
  }
  if (reportFormat === "individual") {
    const wb = await loadIndividualTemplateWorkbook();
    applyExtractedToWorkbook(wb, personnel[0]);
    return wb;
  }
  const wb = await loadMultipleTemplateWorkbook();
  applyMultiplePersonnelToWorkbook(wb, personnel);
  return wb;
}

export function downloadWorkbook(
  wb: XLSX.WorkBook,
  lastName: string,
  mode: "individual" | "multiple",
  count?: number
): void {
  const wbOut = XLSX.write(wb, WRITE_OPTS);
  const blob = new Blob([wbOut], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = (lastName || "UNKNOWN").replace(/[^\w-]+/g, "_").toUpperCase();
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const multi =
    mode === "multiple" && count != null && count >= 1
      ? `_MULTI_${count}`
      : "";
  a.download = `DCIPS_CAS_${safe}${multi}_${ts}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
