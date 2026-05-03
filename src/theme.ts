// ─── Runtime theming for the jobs plugin ─────────────────────────────────────
//
// Three-layer resolution (lowest → highest priority):
//   1. DEFAULT_THEME  — hardcoded fallback
//   2. config/jobs-theme.json — admin edits this file; partial overrides
//   3. DB record (jobs.theme)  — set in-game via +job/theme (future)
//
// Token reference (MUSH color codes):
//   smaj  — major border fill pattern (e.g. "=-")
//   smin  — minor border fill pattern (e.g. "-")
//   title — color for header title text
//   section — color for divider label text
//   hint  — color for hints and dim text
//   bold  — bold modifier applied to title
//   sep   — color applied to the border fill itself

import { DBO } from "@ursamu/ursamu";
import { fromFileUrl } from "@std/path";

export interface JobsTheme {
  tokens: {
    sep:     string;  // color wrapping the fill pattern
    title:   string;  // color for header title text
    frame:   string;  // color for the < > brackets around the title
    section: string;  // color for divider label
    hint:    string;  // dim/hint color
    smaj:    string;  // major fill pattern (MUSH string, may be multi-char)
    smin:    string;  // minor fill pattern
    bold:    string;  // bold prefix applied to title
  };
}

export type PartialJobsTheme = { tokens?: Partial<JobsTheme["tokens"]> };

interface ThemeRecord { id: string; overlay: PartialJobsTheme; }

// ── Defaults ──────────────────────────────────────────────────────────────────
//
// smaj uses two characters that alternate dark blue / bright blue:
//   %cb=   — regular blue  =
//   %ch%cb-  — bright blue -
//
// This demonstrates how a multi-character token (with embedded MUSH codes)
// tiles correctly when fillVis() is used to build the border.

export const DEFAULT_THEME: JobsTheme = {
  tokens: {
    sep:     "",              // colors are baked into smaj/smin
    title:   "%ch%cw",
    frame:   "%ch%cy",       // color for < > brackets around header title
    section: "%cy",
    hint:    "%cy",
    smaj:    "%cb=%ch%cb-",  // 2 visible chars, alternates dark/bright blue
    smin:    "%cb-",         // 1 visible char, plain blue dash
    bold:    "%ch",
  },
};

// ── Merge ─────────────────────────────────────────────────────────────────────

function mergeTheme(base: JobsTheme, overlay: PartialJobsTheme): JobsTheme {
  return { tokens: { ...base.tokens, ...overlay.tokens } };
}

// ── Config file ───────────────────────────────────────────────────────────────

const CONFIG_PATH = fromFileUrl(new URL("../../config/jobs-theme.json", import.meta.url));

async function readJsonConfig(): Promise<PartialJobsTheme> {
  try {
    return JSON.parse(await Deno.readTextFile(CONFIG_PATH)) as PartialJobsTheme;
  } catch { return {}; }
}

// ── Persistence ───────────────────────────────────────────────────────────────

const themeDb = new DBO<ThemeRecord>("jobs.theme");
const THEME_ID = "singleton";

let _theme: JobsTheme = structuredClone(DEFAULT_THEME);
let _configTheme: JobsTheme = structuredClone(DEFAULT_THEME);

export function currentTheme(): JobsTheme { return _theme; }
export function configTheme(): JobsTheme  { return _configTheme; }

export async function loadTheme(): Promise<void> {
  _configTheme = mergeTheme(DEFAULT_THEME, await readJsonConfig());
  const rows = await themeDb.find({ id: THEME_ID });
  _theme = rows.length > 0
    ? mergeTheme(_configTheme, rows[0].overlay)
    : structuredClone(_configTheme);
}

export async function saveThemeOverlay(overlay: PartialJobsTheme): Promise<void> {
  const rows = await themeDb.find({ id: THEME_ID });
  const existing = rows.length > 0 ? rows[0].overlay : {};
  const merged: PartialJobsTheme = { tokens: { ...existing.tokens, ...overlay.tokens } };
  if (rows.length > 0) {
    await themeDb.update({ id: THEME_ID }, { id: THEME_ID, overlay: merged });
  } else {
    await themeDb.create({ id: THEME_ID, overlay: merged });
  }
  _theme = mergeTheme(_configTheme, merged);
}

export async function resetThemeOverlay(): Promise<void> {
  await themeDb.delete({ id: THEME_ID });
  _theme = structuredClone(_configTheme);
}

// ── Renderer ──────────────────────────────────────────────────────────────────

/** Visible (printed) length of a MUSH-formatted string — strips all %cX codes. */
export function visLen(s: string): number {
  return s.replace(/%c[a-zA-Z]/g, "").replace(/%[rnthb]/gi, "").length;
}

/**
 * Fill exactly `visWidth` visible characters by tiling `pattern`.
 *
 * Pattern may contain MUSH color codes — only printable characters count toward
 * the width. A partial repetition at the end tiles character-by-character so
 * the fill always terminates at the correct visual column.
 *
 * Example: fillVis("%cb=%ch%cb-", 5)  →  "%cb=%ch%cb-%cb=%ch%cb-%cb="
 *   visible: = - = - =  (5 chars)
 */
export function fillVis(pattern: string, visWidth: number): string {
  if (visWidth <= 0 || !pattern) return "";
  const pVis = visLen(pattern);
  if (pVis === 0) return "";

  const fullReps = Math.floor(visWidth / pVis);
  const rem      = visWidth % pVis;

  // For the partial remainder: walk the pattern char-by-char counting only
  // printable chars, collecting raw bytes (including MUSH codes before them).
  let partial = "";
  let vis = 0;
  let i = 0;
  while (i < pattern.length && vis < rem) {
    if (pattern[i] === "%" && i + 1 < pattern.length) {
      if (pattern[i + 1] === "c" && i + 2 < pattern.length) {
        // %cX — color code, no visible char; collect it, advance, don't count
        partial += pattern.slice(i, i + 3);
        i += 3;
        continue;
      }
      if ("rntbhiuf".includes(pattern[i + 1])) {
        partial += pattern.slice(i, i + 2);
        i += 2;
        continue;
      }
    }
    // printable char
    partial += pattern[i];
    i++;
    vis++;
  }

  return pattern.repeat(fullReps) + partial + "%cn";
}

// ── Public border functions ───────────────────────────────────────────────────

/**
 * Major header — `smaj` pattern fills both sides around a bold white title.
 *
 * Example (default theme, width 77):
 *   =-=-=-=-=- Title -=-=-=-=-=
 */
export function themeHeader(title: string, width = 77): string {
  const t = currentTheme();
  // " <framed-bracket> title <framed-bracket> "
  // visible: space + < + space + title + space + > + space = title.length + 6
  const inner    = ` ${t.tokens.frame}<%cn ${t.tokens.title}${t.tokens.bold}${title}%cn ${t.tokens.frame}>%cn `;
  const innerVis = title.length + 6;
  const padVis   = Math.max(0, width - innerVis);
  const lpadVis  = Math.floor(padVis / 2);
  const rpadVis  = padVis - lpadVis;
  return fillVis(t.tokens.smaj, lpadVis) + inner + fillVis(t.tokens.smaj, rpadVis);
}

/**
 * Section divider — `smin` pattern fills both sides around an optional label.
 * With no label, returns a full-width `smin` rule.
 *
 * Example (default theme, width 77, label "Comments"):
 *   ----------- Comments -----------
 */
export function themeDivider(label = "", width = 77): string {
  const t = currentTheme();
  if (!label) return fillVis(t.tokens.smin, width);
  const inner    = ` ${t.tokens.section}${label}%cn `;
  const innerVis = label.length + 2;
  const padVis   = Math.max(0, width - innerVis);
  const lpadVis  = Math.floor(padVis / 2);
  const rpadVis  = padVis - lpadVis;
  return fillVis(t.tokens.smin, lpadVis) + inner + fillVis(t.tokens.smin, rpadVis);
}

/**
 * Footer — full-width `smaj` rule, no label.
 */
export function themeFooter(width = 77): string {
  return fillVis(currentTheme().tokens.smaj, width);
}
