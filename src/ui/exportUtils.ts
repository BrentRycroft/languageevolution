/**
 * Triggers a browser download of `content` with the given filename and mime
 * type. Uses a Blob + object URL; cleans the URL up after the click fires.
 *
 * This works for plain text, JSON, CSV, TSV, and any other text format.
 */
export function downloadAs(
  filename: string,
  content: string,
  mime: string = "text/plain;charset=utf-8",
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Escape a single value for inclusion in a CSV row. */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a CSV string from a header row + data rows. */
export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const out: string[] = [];
  out.push(header.map(csvEscape).join(","));
  for (const row of rows) {
    out.push(row.map(csvEscape).join(","));
  }
  return out.join("\n") + "\n";
}

/** Slugify a string for safe use in a filename. */
export function slugForFile(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";
}
