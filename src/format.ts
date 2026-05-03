// ─── Display / format helpers for jobs commands ───────────────────────────────

import type { IJob } from "./types.ts";
import { themeHeader, themeDivider, themeFooter } from "./theme.ts";

export const WIDTH = 77;

/** Returns true when the flag set contains at least one staff role (admin, wizard, or superuser). */
export function isStaffFlags(flags: Set<string>): boolean {
  return flags.has("admin") || flags.has("wizard") || flags.has("superuser");
}

// ── Canonical header/divider/footer (all views use these) ────────────────────

/** Major header — colored border, bold white centered title. */
export function header(title: string): string { return themeHeader(title, WIDTH); }

/** Section divider — lighter border, optional colored title. */
export function divider(title = ""): string { return themeDivider(title, WIDTH); }

/** Footer — full-width solid border. */
export function footer(): string { return themeFooter(WIDTH); }

// Aliases kept so callers don't need to update — all resolve to the same theme.
export const jobHeader  = header;
export const jobFooter  = () => footer();
export const jobDivider = () => divider();

/**
 * Word-wrap plain text to fit within `maxWidth` printable characters.
 * Returns an array of lines, each prefixed with `indent` spaces.
 */
export function wrapText(text: string, maxWidth = WIDTH, indent = 2): string[] {
  const prefix = " ".repeat(indent);
  const usable = maxWidth - indent;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word.slice(0, usable);
    } else if (current.length + 1 + word.length <= usable) {
      current += " " + word;
    } else {
      lines.push(prefix + current);
      current = word.slice(0, usable);
    }
  }
  if (current) lines.push(prefix + current);
  return lines.length ? lines : [prefix];
}

/**
 * Formats a Unix epoch timestamp as a full human-readable string.
 * @returns e.g. `"Mon Mar 22 14:30:00 2026"` or `"???"` on invalid input.
 */
export function formatTimeFull(epoch: number): string {
  try {
    if (!isFinite(epoch)) return "???";
    const d = new Date(epoch);
    const days   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()} ${hh}:${mm}:${ss} ${d.getFullYear()}`;
  } catch { return "???"; }
}

/**
 * Formats a Unix epoch timestamp as a short date+time string.
 * @returns e.g. `"03/22/2026 2:30pm"` or `"???"` on invalid input.
 */
export function formatTimeShort(epoch: number): string {
  try {
    if (!isFinite(epoch)) return "???";
    const d = new Date(epoch);
    const mm   = String(d.getMonth() + 1).padStart(2, "0");
    const dd   = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    const h    = d.getHours();
    const ampm = h >= 12 ? "pm" : "am";
    const h12  = h % 12 || 12;
    const min  = String(d.getMinutes()).padStart(2, "0");
    return `${mm}/${dd}/${yyyy} ${h12}:${min}${ampm}`;
  } catch { return "???"; }
}

/**
 * Formats a Unix epoch timestamp as a compact date string.
 * @returns e.g. `"03-22-26"` or `"???"` on invalid input.
 */
export function formatDate(epoch: number): string {
  try {
    if (!isFinite(epoch)) return "???";
    const d  = new Date(epoch);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}-${dd}-${yy}`;
  } catch { return "???"; }
}

/**
 * Returns the escalation color and label for a job based on time since the
 * last staff comment (or job creation if no staff comments exist yet).
 *
 * - `%cg NEW` — no staff comments yet and < 48 hours old
 * - `` (no label) — has staff activity and < 48 hours since last comment
 * - `%ch%cy DUE` — 48–95 hours without staff activity (yellow)
 * - `%ch%cr DUE` — 96+ hours without staff activity (red)
 */
export function getEscalation(job: IJob): { color: string; label: string } {
  // Escalation is based on time since last staff comment
  const staffComments = job.comments.filter((c) => c.authorId !== job.submittedBy && !c.staffOnly);
  const lastActivity  = staffComments.length > 0
    ? staffComments[staffComments.length - 1].timestamp
    : job.createdAt;
  const hoursSince = (Date.now() - lastActivity) / 3600000;

  if (staffComments.length === 0 && hoursSince < 48) return { color: "%cg", label: "NEW" };
  if (hoursSince < 48) return { color: "%cg", label: "" };
  if (hoursSince < 96) return { color: "%ch%cy", label: "DUE" };
  return { color: "%ch%cr", label: "DUE" };
}

/**
 * Returns true when no staff member has commented on the job yet (i.e. all
 * existing comments were written by the submitter).
 */
export function isNew(job: IJob): boolean {
  return !job.comments.some((c) => c.authorId !== job.submittedBy);
}

/** Fixed column positions for the jobs list table. */
const P = [0, 5, 15, 47, 60, 71];

/**
 * Renders a multi-column jobs list table as an array of MUSH-formatted strings
 * ready to be joined with `\n` and sent via `u.send()`.
 *
 * Columns: `#` | `Category` | `Title` | `Started` | `Handler` | `Status`
 *
 * @param jobList Jobs to display (pre-filtered and sorted by the caller).
 * @param title   Header title shown in the top border (e.g. `"POP Jobs"`).
 */
export function formatJobList(jobList: IJob[], title: string): string[] {
  const lines: string[] = [];
  lines.push(jobHeader(title));

  const placeLine = (cols: string[]): string => {
    const row = " ".repeat(WIDTH).split("");
    for (let i = 0; i < cols.length && i < P.length; i++) {
      const maxW = (i + 1 < P.length ? P[i + 1] - P[i] - 1 : WIDTH - P[i]);
      const text = cols[i].slice(0, maxW);
      for (let c = 0; c < text.length; c++) {
        if (P[i] + c < WIDTH) row[P[i] + c] = text[c];
      }
    }
    return row.join("");
  };

  const hdrRow = placeLine(["#", "Category", "Title", "Started", "Handler", ""]);
  lines.push(`%cc${hdrRow.slice(0, P[5])}${"Status".padStart(WIDTH - P[5])}%cn`);
  lines.push(jobDivider());

  for (const j of jobList) {
    const esc      = getEscalation(j);
    const bucket     = j.bucket || j.category || "???";
    const rawHandler = j.assigneeName || "-----";
    const hPad     = Math.max(0, Math.floor((7 - rawHandler.length) / 2));
    const handler  = " ".repeat(hPad) + rawHandler;
    const rawStatus  = esc.label || "";
    const statusColored = rawStatus ? `${esc.color}${rawStatus}%cn` : "";

    const plainRow = placeLine([String(j.number), bucket, j.title, formatDate(j.createdAt), handler, ""]);
    const statusPad = WIDTH - P[5] - rawStatus.length;
    lines.push(`${plainRow.slice(0, P[5])}${" ".repeat(Math.max(0, statusPad))}${statusColored}`);
  }

  lines.push(jobFooter());
  return lines;
}
