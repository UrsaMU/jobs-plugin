#!/usr/bin/env -S deno run --allow-all --unstable-kv
// Showcase runner — executes commands in-process against the real jobs plugin.
// Usage: deno task showcase [key] [--list]
import { parse } from "@std/flags";
import { expandGlob } from "@std/fs";
import { join } from "@std/path";

interface IDBObj {
  id: string;
  name?: string;
  flags: Set<string>;
  state: Record<string, unknown>;
  contents: IDBObj[];
  data?: Record<string, unknown>;
  [k: string]: unknown;
}
// deno-lint-ignore no-explicit-any
type IUrsamuSDK = any;

const RESET = "\x1b[0m", BOLD = "\x1b[1m", DIM = "\x1b[2m";
const CYAN = "\x1b[36m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RED = "\x1b[31m";
const MUSH: Record<string, string> = {
  "%ch": BOLD, "%cn": RESET,
  "%cr": RED, "%cg": GREEN, "%cb": "\x1b[34m",
  "%cy": YELLOW, "%cw": "\x1b[37m", "%cc": CYAN, "%cm": "\x1b[35m",
  "%r": "\n", "%t": "\t",
};
const mush = (s: string) => s.replace(/%c[a-z]|%[rtnb]/g, (m) => MUSH[m] ?? "");
const itrp = (s: string, v: Record<string, string>) =>
  s.replace(/{{(\w+)}}/g, (_, k) => v[k] ?? "{{" + k + "}}");

interface ShowcaseStep {
  sub?: string;
  note?: boolean | string;
  reset?: boolean;
  emit?: string;
  expect?: string;
  cmd?: string;
  as?: "player" | "staff" | "superuser";
  label?: string;
}

interface ShowcaseFile {
  key: string;
  label: string;
  vars?: Record<string, string>;
  steps: ShowcaseStep[];
}

function buildMockPlayer(name: string, flags: string[] = []): IDBObj {
  return {
    id: `mock-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    flags: new Set(["connected", ...flags]),
    state: {},
    contents: [],
    data: {},
    location: "mock-room",
  };
}

// In-memory store shared across all commands in one showcase run.
// Also used by util.target to resolve actors by name.
// deno-lint-ignore no-explicit-any
const _store: Map<string, Record<string, any>> = new Map();

// deno-lint-ignore no-explicit-any
function _dotSet(obj: Record<string, any>, path: string, value: unknown): void {
  const parts = path.split(".");
  // deno-lint-ignore no-explicit-any
  let cur: Record<string, any> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function buildMockSDK(
  player: IDBObj,
  cmdName: string,
  args: (string | undefined)[],
  rawCmd: string,
  output: string[],
): IUrsamuSDK {
  const noop = () => Promise.resolve();
  const noopSync = () => {};
  return {
    me: player,
    here: {
      id: "mock-room",
      name: "Showcase Room",
      flags: new Set(),
      state: {},
      contents: [],
      broadcast: noopSync,
    },
    cmd: { name: cmdName, original: rawCmd, args: args as string[] },
    send(msg: string) { output.push(msg); },
    util: {
      // deno-lint-ignore no-control-regex
      stripSubs: (s: string) => s.replace(/\x1b\[[^m]*m/g, "").replace(/%c[a-z]/gi, ""),
      center: (s: string, len: number, filler = " ") => {
        const plain = s.replace(/%c[a-z]/gi, "").replace(/%[rtnb]/gi, "");
        const pad = Math.max(0, len - plain.length);
        const left = Math.floor(pad / 2);
        return filler.repeat(left) + s + filler.repeat(pad - left);
      },
      target: (_actor: IDBObj, query: string) => {
        const q = query.toLowerCase().trim();
        for (const obj of _store.values()) {
          if (obj.name != null && String(obj.name).toLowerCase() === q) return Promise.resolve(obj as IDBObj);
        }
        return Promise.resolve(undefined);
      },
      displayName: (obj: IDBObj) => obj.name ?? obj.id,
      search: () => Promise.resolve([]),
      create: (t: Partial<IDBObj>) => Promise.resolve({ ...buildMockPlayer(t.name ?? "obj"), ...t }),
    },
    canEdit: () => Promise.resolve(true),
    checkLock: () => Promise.resolve(true),
    auth: { verify: () => Promise.resolve(false), whoami: () => Promise.resolve(null) },
    sys: { restart: noop, shutdown: noop, reload: noop, uptime: () => Promise.resolve(0) },
    chan: { create: noop, destroy: noop, set: noop, history: () => Promise.resolve([]) },
    bb: { get: () => Promise.resolve(null), set: noop, clear: () => Promise.resolve(false) },
    setFlags: noop,
    events: { emit: noopSync, on: noopSync, off: noopSync },
  } as unknown as IUrsamuSDK;
}

/** Clear all jobs-related KV prefixes so each showcase run starts fresh. */
async function clearJobsKv(): Promise<void> {
  const kvPath = new URL("../data/ursamu.db", import.meta.url).pathname;
  for (const path of [kvPath, undefined]) {
    try {
      const kv = path ? await Deno.openKv(path) : await Deno.openKv();
      for (const prefix of [["server_jobs"], ["server_jobs_archive"], ["server_jobs_access"],
                             ["server_counters"]]) {
        const entries = kv.list({ prefix });
        for await (const e of entries) await kv.delete(e.key);
      }
      kv.close();
    } catch { /* ignore */ }
  }
}

let _cmdsLoaded = false;
async function ensureCmdsLoaded() {
  if (_cmdsLoaded) return;
  _cmdsLoaded = true;
  try {
    await import("../src/commands.ts");
  } catch (e) {
    console.error(DIM + "  [warn] commands load error: " + (e as Error).message + RESET);
  }
}

async function execCmd(raw: string, player: IDBObj): Promise<string[]> {
  await ensureCmdsLoaded();
  const { cmds } = await import("@ursamu/ursamu/cmd-parser");
  const output: string[] = [];
  for (const cmd of cmds) {
    const match = raw.trim().match(cmd.pattern);
    if (!match) continue;
    const u = buildMockSDK(player, cmd.name, match.slice(1), raw.trim(), output);
    try {
      await cmd.exec(u);
    } catch (e) {
      output.push(`%ch%cr>> exec error: ${(e as Error).message}%cn`);
    }
    return output;
  }
  output.push(`%cw>> no command matched: ${raw}%cn`);
  return output;
}

interface RunState {
  player: IDBObj;
  staff: IDBObj;
  superuser: IDBObj;
}

async function renderStep(
  step: ShowcaseStep,
  vars: Record<string, string>,
  state: RunState,
): Promise<void> {
  if ("sub" in step && step.sub != null) {
    console.log("\n" + DIM + "── " + step.sub + " " + "─".repeat(Math.max(0, 66 - step.sub.length)) + RESET);
    return;
  }
  if ("note" in step && step.note != null) {
    console.log("  " + DIM + itrp(String(step.note), vars) + RESET);
    return;
  }
  if ("reset" in step) {
    _store.clear();
    console.log("  " + DIM + "[state reset]" + RESET);
    return;
  }
  if ("emit" in step && step.emit != null) {
    console.log("  " + BOLD + "emit " + RESET + mush(itrp(step.emit, vars)) +
      (step.label ? "  " + DIM + "# " + step.label + RESET : ""));
    return;
  }
  if ("expect" in step && step.expect != null) {
    console.log("  " + DIM + "expect → " + step.expect + RESET);
    return;
  }
  if ("cmd" in step && step.cmd != null) {
    const raw = itrp(step.cmd, vars);
    const lbl = step.label ? "  " + DIM + "# " + step.label + RESET : "";
    let actor: IDBObj;
    if (step.as === "staff") actor = state.staff;
    else if (step.as === "superuser") actor = state.superuser;
    else actor = state.player;
    const roleNote = step.as ? "  " + DIM + "[as: " + step.as + "]" + RESET : "";
    console.log("  " + BOLD + "> " + raw + RESET + roleNote + lbl);
    const lines = await execCmd(raw, actor);
    for (const line of lines) {
      for (const rendered of mush(line).split("\n")) {
        if (rendered.trim()) console.log("     " + rendered);
      }
    }
  }
}

async function pickInteractive(files: ShowcaseFile[]): Promise<ShowcaseFile | null> {
  const sorted = [...files].sort((a, b) => a.key.localeCompare(b.key));
  let idx = 0;
  const hideCursor = () => Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25l"));
  const showCursor = () => Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25h"));
  const draw = () => {
    const lines = sorted.length + 3;
    Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${lines}A\x1b[0J`));
    console.log(BOLD + CYAN + "  Jobs Showcases" + RESET + DIM + "  — ↑↓ navigate  Enter select  q quit" + RESET);
    console.log(DIM + "  " + "─".repeat(50) + RESET);
    for (let i = 0; i < sorted.length; i++) {
      const sel = i === idx;
      console.log((sel ? GREEN + "  ▶ " + BOLD : "    " + DIM) + sorted[i].label + RESET);
    }
    console.log(DIM + "  " + "─".repeat(50) + RESET);
  };
  console.log(BOLD + CYAN + "  Jobs Showcases" + RESET + DIM + "  — ↑↓ navigate  Enter select  q quit" + RESET);
  console.log(DIM + "  " + "─".repeat(50) + RESET);
  for (let i = 0; i < sorted.length; i++) {
    const sel = i === idx;
    console.log((sel ? GREEN + "  ▶ " + BOLD : "    " + DIM) + sorted[i].label + RESET);
  }
  console.log(DIM + "  " + "─".repeat(50) + RESET);
  hideCursor();
  Deno.stdin.setRaw(true);
  const buf = new Uint8Array(4);
  try {
    while (true) {
      const n = await Deno.stdin.read(buf);
      if (!n) break;
      const b = buf.slice(0, n);
      if (b[0] === 13) { draw(); return sorted[idx]; }
      if (b[0] === 113 || b[0] === 3 || (b[0] === 27 && n === 1)) { return null; }
      if (b[0] === 27 && b[1] === 91 && b[2] === 65) { idx = (idx - 1 + sorted.length) % sorted.length; draw(); continue; }
      if (b[0] === 27 && b[1] === 91 && b[2] === 66) { idx = (idx + 1) % sorted.length; draw(); continue; }
    }
  } finally {
    Deno.stdin.setRaw(false);
    showCursor();
  }
  return null;
}

async function runShowcase(sf: ShowcaseFile): Promise<void> {
  _store.clear();
  await clearJobsKv();

  const vars = sf.vars ?? {};
  const state: RunState = {
    player: buildMockPlayer(vars.player ?? "Player", ["player"]),
    staff: buildMockPlayer(vars.staff ?? "Staff", ["player", "admin"]),
    superuser: buildMockPlayer(vars.superuser ?? "Superuser", ["player", "superuser"]),
  };

  // Register all actors in _store so util.target can resolve them by name
  for (const actor of [state.player, state.staff, state.superuser]) {
    _store.set(actor.id, {
      id: actor.id, name: actor.name,
      flags: actor.flags, state: {}, contents: [],
    });
    // Also index by lowercase name for easy lookup
    _store.set(`name:${String(actor.name).toLowerCase()}`, {
      id: actor.id, name: actor.name,
      flags: actor.flags, state: {}, contents: [],
    });
  }

  console.log("\n" + BOLD + "═".repeat(70) + RESET);
  console.log(BOLD + "  " + sf.label + RESET);
  console.log(BOLD + "═".repeat(70) + RESET);
  for (const step of sf.steps) {
    await renderStep(step as ShowcaseStep, vars, state);
  }
  console.log("\n" + DIM + "─".repeat(70) + RESET + "\n");
}

async function main(): Promise<void> {
  const args = parse(Deno.args, { boolean: ["list", "help"], alias: { h: "help", l: "list" } });
  if (args.help) {
    console.log("Usage: deno task showcase [key] [--list]\n\n  --list   List all showcases\n  --help   Show help");
    return;
  }
  const files: ShowcaseFile[] = [];
  for await (const entry of expandGlob(join(Deno.cwd(), "showcases", "*.json"))) {
    try { files.push(JSON.parse(await Deno.readTextFile(entry.path)) as ShowcaseFile); }
    catch { /* skip */ }
  }
  if (files.length === 0) { console.log("No showcase files found in showcases/"); return; }
  if (args.list) {
    console.log("\nAvailable showcases:\n");
    for (const f of files) console.log("  " + BOLD + f.key + RESET + "  " + DIM + f.label + RESET);
    return;
  }
  const key = args._[0]?.toString();
  if (key) {
    const chosen = files.find((f) => f.key === key);
    if (!chosen) { console.error("Showcase '" + key + "' not found. Run --list to see keys."); return; }
    await runShowcase(chosen);
    return;
  }
  while (true) {
    const picked = await pickInteractive(files);
    if (!picked) { console.log("\n" + DIM + "Cancelled." + RESET); Deno.exit(0); }
    await runShowcase(picked);
    console.log(DIM + "  Press any key to return to menu..." + RESET);
    Deno.stdin.setRaw(true);
    const tmp = new Uint8Array(4);
    await Deno.stdin.read(tmp);
    Deno.stdin.setRaw(false);
    console.log();
  }
}

await main();
