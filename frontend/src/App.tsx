import { useCallback, useMemo, useState } from "react";
import { extractDcips } from "./lib/extract";
import { scrubNarrativeForNetwork } from "./lib/scrub";
import { buildPopulatedWorkbook, downloadWorkbook } from "./lib/xlsxExport";
import type { DcipsExtracted, ReportFormat } from "./types/dcips";
import { optionsForField } from "./lib/dcipsPicklists.generated";
import { DCIPS_KEYS } from "./types/dcips";

const EXAMPLE = `SITUATION: Soldier was the driver of a Mine Resistant Ambush Protected vehicle (MRAP) on a convoy enroute south to Combat Operating Base (COB) Scott. After passing the last Khorathindin National Guard checkpoint, an Improvised Explosive Device (IED) exploded. The lead vehicle proceeded through the blast area, after which the rest of the element encountered small arms fire. In the din of combat, SGT Plank's vehicle separated from the rest of the convoy and came under intense enemy fire. He suffered severe wounds and his team immediately evacuated SGT Plank, Doe to the nearest battalion aid station, where he died of wounds received. Three 7.62 mm rounds entered through his shoulder area and punctured the main heart valves. Soldier was officially pronounced deceased by LTC Mary Carter (Army doctor assigned to the 105th BN Aid Station, FOB James, Karbala) 08 Oct 12 at 1535 local hours.
DATE AND TIME OF INCIDENT: 08 Oct 12, 1246 (local)
GEOGRAPHIC LOCATION: Grid coordinates MD 49298753

BACKGROUND AND OTHER DATA:
* Field Report: 12345
* SSN: 010101010
* Place of Birth: White Plains, NY
* Spouse Name: Sarah C. Plank
* Spouse DOB: 31 Oct 1972
* Date of Marriage: 5 Dec 1990
* Last Report #: 9-0003
* Notification Status: Not Notified
* Notifying CAC: Fort Drum, NY
* Religious Ministration: Yes
* Current Unit: CO A, 1st Battalion, 69th Infantry regiment, 27th Infantry Brigade Combat Team
* UIC: WPAQAO
* Component: Army National Guard
REVIEWING FIELD GRADE OFFICER: MAJ (Insert Your Name)
ADDITIONAL AWARDS PROCESSED FOR CURRENT OPERATIONS: CAB, PH, and Bronze Star Medal, and Campaign Medals`;

const PREVIEW_FIELDS: { label: string; key: keyof DcipsExtracted }[] = [
  { label: "Last Name", key: "Last_Name" },
  { label: "First Name", key: "First_Name" },
  { label: "Branch", key: "Branch_of_Service" },
  { label: "Rank", key: "Rank" },
  { label: "Unit", key: "Military_Unit" },
  { label: "SSN", key: "SSN" },
  { label: "Casualty Type", key: "Casualty_Type_Status_Category" },
  { label: "Inflicting Force", key: "Inflicting_Force" },
  { label: "Incident Date", key: "Incident_Date_Time" },
  { label: "Location/Grid", key: "Grid" },
  { label: "Operation", key: "Operation" },
  { label: "Duty Status", key: "Duty_Status" },
];

function formatSsnPreview(ssn: string): string {
  const d = ssn.replace(/\D/g, "");
  if (d.length < 4) return "";
  return `***-**-${d.slice(-4)}`;
}

const inputClass =
  "focus-ring w-full rounded-lg border border-border bg-white px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

const btnPrimaryClass =
  "focus-ring inline-flex w-full items-center justify-center rounded-lg bg-accent px-6 py-3.5 font-heading text-sm font-semibold uppercase tracking-wider text-accent-foreground transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50";

const btnSecondaryClass =
  "focus-ring inline-flex items-center justify-center rounded-lg border border-accent bg-white px-5 py-2.5 font-heading text-sm font-semibold uppercase tracking-wider text-accent transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50";

const selectClass =
  `${inputClass} cursor-pointer bg-white`;

function DcipsFieldInput({
  id,
  fieldKey,
  value,
  onChange,
}: {
  id: string;
  fieldKey: keyof DcipsExtracted;
  value: string;
  onChange: (v: string) => void;
}) {
  if (fieldKey === "Circumstances" || fieldKey === "Remarks") {
    return (
      <textarea
        id={id}
        className={`${inputClass} min-h-[64px] resize-y`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  const opts = optionsForField(fieldKey);
  if (opts && opts.length > 0) {
    const custom = Boolean(value && !opts.includes(value));
    return (
      <select
        id={id}
        className={selectClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— Select —</option>
        {custom ? (
          <option value={value}>
            {value} (current — not in DCIPS list)
          </option>
        ) : null}
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      id={id}
      className={inputClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function App() {
  const apiConfigured = Boolean(import.meta.env.VITE_API_URL?.trim());
  const [narrative, setNarrative] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusHtml, setStatusHtml] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"" | "error" | "success">("");
  const [extractedList, setExtractedList] = useState<DcipsExtracted[] | null>(
    null
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewList, setReviewList] = useState<DcipsExtracted[]>([]);
  const [reportFormat, setReportFormat] = useState<ReportFormat>("individual");
  /** Format used for the last successful extraction (download follows this, not the radio if toggled later). */
  const [resultReportFormat, setResultReportFormat] = useState<ReportFormat | null>(
    null
  );
  const [downloading, setDownloading] = useState(false);

  const setStatus = useCallback(
    (msg: string, type: "" | "error" | "success" = "") => {
      setStatusHtml(msg);
      setStatusType(type);
    },
    []
  );

  const showPreview = extractedList !== null && extractedList.length > 0;
  const previewSource = extractedList?.[0] ?? null;
  const casualtyCount = extractedList?.length ?? 0;

  const onGenerate = async () => {
    if (!apiConfigured) {
      setStatus("Configure VITE_API_URL to use extraction.", "error");
      return;
    }
    const raw = narrative.trim();
    if (!raw) {
      setStatus("ERROR: Casualty narrative required.", "error");
      return;
    }

    setLoading(true);
    setExtractedList(null);
    setResultReportFormat(null);
    setReviewOpen(false);
    setStatus(
      '<span class="spinner"></span> Transmitting sanitized text to extraction service...',
      ""
    );

    try {
      const scrubbed = scrubNarrativeForNetwork(raw);
      const { personnel } = await extractDcips(scrubbed, reportFormat);
      const copy = personnel.map((p) => ({ ...p }));
      setExtractedList(personnel);
      setReviewList(copy);
      setResultReportFormat(reportFormat);
      setReviewOpen(true);
      setStatus("✓ Data extracted. Review fields below, then download.", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`ERROR: ${msg}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const onDownload = async () => {
    setDownloading(true);
    setStatus("Preparing spreadsheet…", "");
    try {
      const fmt = resultReportFormat ?? reportFormat;
      const wb = await buildPopulatedWorkbook(reviewList, fmt);
      const primary = reviewList[0]?.Last_Name ?? "UNKNOWN";
      downloadWorkbook(
        wb,
        primary,
        fmt === "multiple" ? "multiple" : "individual",
        reviewList.length
      );
      setStatus("✓ Download started.", "success");
      setReviewOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`ERROR generating file: ${msg}`, "error");
    } finally {
      setDownloading(false);
    }
  };

  const updateReview = useCallback(
    (index: number, key: keyof DcipsExtracted, value: string) => {
      setReviewList((prev) =>
        prev.map((row, i) => (i === index ? { ...row, [key]: value } : row))
      );
    },
    []
  );

  const previewCells = useMemo(() => {
    if (!previewSource) return [];
    return PREVIEW_FIELDS.map(({ label, key }) => {
      let v = previewSource[key] ?? "";
      if (key === "SSN") v = formatSsnPreview(v);
      if (key === "Grid" && !v) v = previewSource.Country;
      return { label, value: v };
    });
  }, [previewSource]);

  const statusTextClass =
    statusType === "error"
      ? "text-status-danger"
      : statusType === "success"
        ? "text-status-success"
        : "text-foreground";

  return (
    <div className="flex min-h-screen flex-col bg-background font-body text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}25od.png`}
            alt="25th Infantry Division insignia"
            className="h-12 w-auto shrink-0 object-contain"
          />
          <div>
            <h1 className="font-heading text-lg font-bold uppercase tracking-wide text-accent">
              DCIPS CAS Report Generator
            </h1>
            <p className="text-xs text-muted-foreground">
              Defense Casualty Information Processing System — automated field
              report tool
            </p>
          </div>
        </div>
        <div className="rounded-md border border-border bg-muted px-3 py-1.5 font-heading text-xs font-bold uppercase tracking-wider text-foreground">
          3BDE
        </div>
      </header>

      <main className="flex-1">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {!apiConfigured && (
          <div className="banner-error mb-8">
            Set <code>VITE_API_URL</code> to your Cloudflare Worker base URL
            (e.g. in <code>.env.local</code>) and restart Vite. Example:{" "}
            <code>http://localhost:8787</code>
          </div>
        )}

        <div className="card-military mb-8">
          <div className="military-header">Mission brief</div>
          <div className="card-military-body text-sm leading-relaxed text-foreground">
            Enter a casualty situation narrative in natural language. The system
            will parse the incident details and generate a populated DCIPS spreadsheet.
            Choose the report type below before generating: Individual (single-casualty
            import) or Multiple (one row per casualty). The model uses a shorter prompt
            for Individual so it does not spend tokens deciding how many people are in
            the narrative.
            Sensitive patterns are scrubbed before the text is sent to the
            extraction service.
          </div>
        </div>

        <div className="card-military mb-8">
          <div className="military-header">Casualty input</div>
          <div className="card-military-body space-y-4">
            <fieldset className="space-y-2">
              <legend className="mb-2 block font-heading text-xs font-semibold uppercase tracking-wider text-accent">
                Report type
              </legend>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-6">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="reportFormat"
                    className="h-4 w-4 border-border text-accent focus:ring-accent"
                    checked={reportFormat === "individual"}
                    onChange={() => setReportFormat("individual")}
                  />
                  <span>
                    <span className="font-medium">Individual</span>
                    <span className="block text-xs text-muted-foreground">
                      Single-casualty import spreadsheet (Version 2)
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="reportFormat"
                    className="h-4 w-4 border-border text-accent focus:ring-accent"
                    checked={reportFormat === "multiple"}
                    onChange={() => setReportFormat("multiple")}
                  />
                  <span>
                    <span className="font-medium">Multiple casualties</span>
                    <span className="block text-xs text-muted-foreground">
                      Multiple Casualty Report template (one row per person)
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
            <label className="block" htmlFor="situationText">
              <span className="mb-2 block font-heading text-xs font-semibold uppercase tracking-wider text-accent">
                Casualty situation report
              </span>
              <textarea
                id="situationText"
                className={`${inputClass} min-h-[200px] resize-y leading-relaxed`}
                placeholder="Paste the casualty situation narrative here..."
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="text-sm font-medium text-accent underline underline-offset-2 hover:text-accent/80"
              onClick={() => setNarrative(EXAMPLE)}
            >
              Load example report
            </button>
            <p className="text-xs text-muted-foreground">
              Narrative is preprocessed to mask SSN-like and DOB-like patterns
              before any network request.
            </p>
            <button
              type="button"
              className={btnPrimaryClass}
              disabled={loading}
              onClick={() => void onGenerate()}
            >
              Generate DCIPS CAS report
            </button>
          </div>
        </div>

        {statusHtml && (
          <div className="card-military mb-8">
            <div className="military-header">System status</div>
            <div className={`card-military-body text-sm ${statusTextClass}`}>
              <div dangerouslySetInnerHTML={{ __html: statusHtml }} />
            </div>
          </div>
        )}

        {showPreview && (
          <div className="card-military mb-8">
            <div className="military-header flex flex-wrap items-center justify-between gap-2">
              <span>Extracted summary</span>
              {resultReportFormat === "multiple" && (
                <span className="rounded border border-accent/40 bg-accent/10 px-2 py-0.5 font-heading text-[0.65rem] font-bold uppercase tracking-wide text-accent">
                  {casualtyCount} row{casualtyCount === 1 ? "" : "s"} — multiple
                  template on download
                </span>
              )}
            </div>
            {resultReportFormat === "multiple" && casualtyCount > 1 && (
              <p className="border-b border-border/60 px-4 py-2 text-xs text-muted-foreground">
                Summary shows the first casualty; review lists all {casualtyCount}{" "}
                before downloading.
              </p>
            )}
            <div className="overflow-x-auto p-0">
              <table className="table-military">
                <thead>
                  <tr>
                    <th className="text-left">Field</th>
                    <th className="text-left">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {previewCells.map(({ label, value }) => (
                    <tr key={label}>
                      <td className="font-medium text-foreground">{label}</td>
                      <td className="text-foreground">
                        {value ? (
                          value
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-military-body border-t border-border/60 pt-4">
              <p className="mb-4 text-xs text-muted-foreground">
                Open the review dialog to edit all fields and download the .xlsx
                file.
              </p>
              <button
                type="button"
                className={`${btnSecondaryClass} w-full sm:w-auto`}
                onClick={() => setReviewOpen(true)}
              >
                Review / edit fields
              </button>
            </div>
          </div>
        )}
      </div>
      </main>

      <footer className="mt-auto border-t border-border bg-white px-4 py-8 text-center text-xs uppercase tracking-wider text-muted-foreground">
        <p>DCIPS CAS report generator — for official use only — unclassified</p>
        <p className="mt-2 normal-case tracking-normal">
          Brought to you by 1LT APANPA
        </p>
      </footer>

      {reviewOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/45 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReviewOpen(false);
          }}
        >
          <div
            className="card-military my-6 w-full max-w-3xl shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-dialog-title"
          >
            <div
              className="military-header flex items-center justify-between gap-4"
              id="review-dialog-title"
            >
              <span>Review extracted data</span>
            </div>
            <div className="card-military-body max-h-[min(60vh,520px)] space-y-4 overflow-y-auto border-b border-border/60">
              <p className="text-xs text-muted-foreground">
                Correct any extraction errors. Values here are written to the
                downloaded workbook only.
              </p>
              <div className="space-y-8 pr-1">
                {reviewList.map((reviewData, personIndex) => (
                  <div
                    key={personIndex}
                    className="space-y-3 border-b border-border/40 pb-6 last:border-b-0 last:pb-0"
                  >
                    {reviewList.length > 1 && (
                      <p className="font-heading text-xs font-bold uppercase tracking-wide text-accent">
                        Casualty {personIndex + 1} of {reviewList.length}
                        {reviewData.Last_Name || reviewData.First_Name
                          ? ` — ${[reviewData.Last_Name, reviewData.First_Name].filter(Boolean).join(", ")}`
                          : ""}
                      </p>
                    )}
                    <div className="space-y-3">
                      {DCIPS_KEYS.map((key) => (
                        <div key={`${personIndex}-${String(key)}`}>
                          <label
                            className="mb-1 block font-heading text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground"
                            htmlFor={`review-${personIndex}-${String(key)}`}
                          >
                            {key.replace(/_/g, " ")}
                          </label>
                          <DcipsFieldInput
                            id={`review-${personIndex}-${String(key)}`}
                            fieldKey={key}
                            value={reviewData[key]}
                            onChange={(v) => updateReview(personIndex, key, v)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-3 bg-[var(--military-card-bg)] px-5 py-4">
              <button
                type="button"
                className={btnSecondaryClass}
                onClick={() => setReviewOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                className={`${btnPrimaryClass} w-auto min-w-[12rem]`}
                disabled={downloading}
                onClick={() => void onDownload()}
              >
                {downloading ? "…" : "Download populated DCIPS .xlsx"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
