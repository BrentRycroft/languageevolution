/**
 * Phase 50 T5: shared `<ExportButtons>` for any data view that wants
 * copy-to-clipboard + CSV download. Bundles `CopyButton` and a CSV
 * download into a single small toolbar so the look + ARIA labels stay
 * uniform across views (PhonemeInventory, Grammar, Stats, etc.).
 */
import type { ReactNode } from "react";
import { CopyButton } from "../CopyButton";
import { downloadAs, toCsv, slugForFile } from "../exportUtils";

export interface ExportButtonsProps {
  /** Filename slug — `.csv` is appended automatically. */
  filenameBase: string;
  /** CSV header row. Required when `csv` is provided. */
  csvHeader?: readonly string[];
  /** Row data for CSV export. Each row is an array of cells. */
  csvRows?: readonly (readonly unknown[])[];
  /** Plain-text payload for the copy button. */
  copyText: string | (() => string);
  /** Optional small label rendered at the start of the toolbar. */
  hint?: ReactNode;
}

export function ExportButtons({
  filenameBase,
  csvHeader,
  csvRows,
  copyText,
  hint,
}: ExportButtonsProps) {
  const onDownloadCsv = () => {
    if (!csvHeader || !csvRows) return;
    const csv = toCsv(csvHeader, csvRows);
    downloadAs(
      `${slugForFile(filenameBase)}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  };
  const csvAvailable = !!(csvHeader && csvRows && csvRows.length > 0);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
      role="toolbar"
      aria-label="Export"
    >
      {hint && (
        <span style={{ color: "var(--muted)", fontSize: 11 }}>{hint}</span>
      )}
      <CopyButton text={copyText} title="Copy as plain text" />
      {csvAvailable && (
        <button
          type="button"
          className="ghost"
          onClick={onDownloadCsv}
          title="Download as CSV"
          aria-label="Download as CSV"
          style={{ fontSize: 11, padding: "2px 8px" }}
        >
          CSV
        </button>
      )}
    </div>
  );
}
