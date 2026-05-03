# ursamu-jobs-plugin — Claude Code Instructions

## Project identity

Standalone Deno/JSR package (`@ursamu/jobs-plugin`) providing an Anomaly-style
jobs/request system for UrsaMU games. This is **not** inside the engine repo —
it is a consumer of `jsr:@ursamu/ursamu`.

---

## Commands

```bash
deno task test          # run tests — must stay green (alias for deno test --allow-all --unstable-kv --no-check tests/)
deno task showcase      # run all showcase walkthroughs and print results
deno check mod.ts       # type check
deno lint               # must be clean
deno publish --dry-run  # verify publish config before tagging
```

## Pre-commit checklist (all must pass before every commit)

```bash
deno check mod.ts
deno lint
deno task test
deno publish --dry-run
```

## Showcases

Showcases live in `showcases/`. The runner is `tools/showcase.ts`.

```bash
deno task showcase            # interactive menu — pick a showcase to run
deno task showcase <key>      # run a specific showcase directly
```

Showcases **execute real commands against the live plugin code** — they are not documentation printouts. The runner imports `src/commands.ts`, matches each `cmd` step against registered command patterns, and calls `exec()` in-process. DBO state (jobs, archive, access) is real Deno KV, cleared between runs.

Available showcases:

| Key | What it covers |
|-----|---------------|
| `jobs-requests` | Player request lifecycle |
| `jobs-staff` | Staff job workflow |
| `jobs-resolve` | Resolve and reopen |
| `jobs-access` | Bucket access control |
| `jobs-admin` | Superuser operations |
| `jobs-hooks` | Hook event sequence |

**Rule:** Every new command or REST route needs a showcase step. Run `deno task showcase` to validate.

Showcase JSON format:
```json
{
  "key": "jobs-basic",
  "label": "Jobs — Display Name",
  "vars": { "player": "Alice" },
  "steps": [
    { "sub": "Section heading" },
    { "note": "Explanatory note shown in dim text." },
    { "cmd": "+request Title=Desc.", "label": "inline label", "as": "player" },
    { "cmd": "+jobs", "as": "staff" },
    { "reset": true }
  ]
}
```

Step types: `sub` (heading), `note` (grey text), `cmd` (execute command), `reset` (clear KV state).
`as` field: `"player"` (default), `"staff"` (admin flags), `"superuser"`.

---

## Repo layout

```
src/                Plugin source — all TypeScript
  index.ts          IPlugin definition (init, remove)
  commands.ts       Barrel import for all command files
  request-cmd.ts    +request/+requests/+myjobs commands
  staff-cmd.ts      +job/+jobs commands
  archive-cmd.ts    +archive command
  router.ts         REST /api/v1/jobs handler
  db.ts             DBO collections (jobs, jobArchive, jobAccess) + bucket registry
  types.ts          IJob, IJobComment, IJobAccess, JobBucket domain types
  hooks.ts          jobHooks event bus (typed: job:created, job:commented, etc.)
  hooks-augment.ts  GameHookMap declaration merging
  notify.ts         Staff in-game notifications on job:created
  format.ts         MUSH formatting helpers
  job-utils.ts      Shared job lookup/access helpers
  mail.ts           In-game mail integration
src/help/           In-game help files (Markdown, served by help-plugin FileProvider)
tests/              Deno test files
mod.ts              Public API exports (domain types, db layer, hooks, plugin)
index.ts            Plugin entry point (re-exports default from src/index.ts)
ursamu.plugin.json  Plugin manifest
deno.json           Package config
```

---

## Imports — always use JSR

```typescript
// All source files in this repo
import { addCmd, DBO, gameHooks, registerPluginRoute } from "jsr:@ursamu/ursamu";
import type { ICmd, IPlugin, IDBObj, IUrsamuSDK } from "jsr:@ursamu/ursamu";
import { registerHelpDir } from "jsr:@ursamu/help-plugin";

// External consumers of this package
import { jobHooks } from "@ursamu/jobs-plugin";
```

Never use relative imports into the engine. Never import from `ursamu` source paths.

---

## addCmd skeleton

```typescript
addCmd({
  name: "+job",
  pattern: /^\+job(?:\/(\S+))?\s*(.*)/i,  // args[0]=switch, args[1]=rest
  lock: "connected admin+",
  category: "Jobs",
  help: `+job[/<switch>] <id> [<value>]  — Brief description.

Switches:
  /switch   What this switch does.

Examples:
  +job 42              View job #42.
  +job/close 42=Done   Close job #42 with note.`,
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    // ...
  },
});
```

### Pattern cheat-sheet

| Intent | Pattern | args |
|--------|---------|------|
| No args | `/^inventory$/i` | — |
| One arg | `/^\+jobs\s*(.*)/i` | `[0]` |
| Switch + arg | `/^\+job(?:\/(\S+))?\s*(.*)/i` | `[0]`=sw, `[1]`=rest |
| Two parts (=) | `/^\+request\s+(.+)=(.+)/i` | `[0]`, `[1]` |

### Catch-all switch pattern — critical gotcha

When a command uses the catch-all switch pattern `/^\+cmd(?:\/(\S+))?\s*(.*)/i`,
**any more-specific `addCmd` registered for the same prefix will never match**.
The catch-all pattern consumes `+cmd/anything` before the engine reaches the
specific pattern.

```typescript
// WRONG — +job/theme addCmd is DEAD CODE; main +job handler matches first
addCmd({ name: "+job", pattern: /^\+job(?:\/(\S+))?\s*(.*)/i, exec: ... });
addCmd({ name: "+job/theme", pattern: /^\+job\/theme$/i, exec: ... }); // never reached

// CORRECT — handle sub-commands as switch branches inside the main exec
addCmd({
  name: "+job",
  pattern: /^\+job(?:\/(\S+))?\s*(.*)/i,
  exec: async (u) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    if (sw === "theme")       { /* theme display */ return; }
    if (sw === "theme/set")   { /* theme set */ return; }
    if (sw === "theme/reset") { /* theme reset */ return; }
    // ...
  },
});
```

This applies to all UrsaMU `addCmd` registrations — not just jobs. Any plugin
with a catch-all switch pattern must route all sub-commands internally.

### Lock levels

| String | Who can use it |
|--------|----------------|
| `"connected"` | Any logged-in player |
| `"connected admin+"` | Admin flag or higher |
| `"connected wizard"` | Wizard only |

---

## Key SDK idioms

```typescript
// Target resolution — always guard null
const target = await u.util.target(u.me, rawName, true);
if (!target) { u.send("Not found."); return; }

// Strip MUSH codes BEFORE DB ops or length checks (always)
const clean = u.util.stripSubs(u.cmd.args[0]).trim();

// Admin check
const isStaff = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");

// Send to another player
u.send("Message.", target.id);
```

---

## Plugin architecture (three phases — non-negotiable)

```
Phase 1 — module load   import "./commands.ts" → addCmd() fires at load time (NOT in init)
Phase 2 — init()        wire jobHooks/gameHooks listeners, registerPluginRoute,
                        registerHelpDir, seed bucket access → return true
Phase 3 — remove()      jobHooks.off() / gameHooks.off() for every .on()
                        using the SAME named function reference
```

```typescript
// src/index.ts
import "./commands.ts";                                    // Phase 1
import { gameHooks, registerPluginRoute } from "jsr:@ursamu/ursamu";
import type { IPlugin } from "jsr:@ursamu/ursamu";
import { registerHelpDir } from "jsr:@ursamu/help-plugin";
import { jobHooks } from "./hooks.ts";
import { onJobCreated } from "./notify.ts";

export default {
  name: "jobs",
  version: "1.0.0",
  description: "Anomaly-style jobs/request system.",
  init: () => {
    registerPluginRoute("/api/v1/jobs", router);
    registerHelpDir(new URL("./help", import.meta.url));
    jobHooks.on("job:created", onJobCreated);
    return true;                                           // must return true
  },
  remove: () => {
    jobHooks.off("job:created", onJobCreated);
  },
} satisfies IPlugin;
```

**DBO namespace rule** — all collections prefixed `jobs.`:

```typescript
const records   = new DBO<IJob>("jobs.records");   // correct
const archive   = new DBO<IJob>("jobs.archive");   // correct
const access    = new DBO<IJobAccess>("jobs.access"); // correct
const records   = new DBO<IJob>("records");        // wrong — collides
```

---

## Public API surface (`mod.ts`)

External consumers import from `@ursamu/jobs-plugin`:

- Domain types: `IJob`, `IJobComment`, `IJobAccess`, `JobBucket`
- DB layer: `jobRecords`, `jobArchive`, `jobAccess`
- Event bus: `jobHooks` — subscribe to `job:created`, `job:commented`, etc.
- Bucket registry
- Plugin default export

---

## MUSH color codes

| Code | Effect | Code | Effect |
|------|--------|------|--------|
| `%ch` | Bold | `%cn` | Reset (always close with this) |
| `%cr` | Red | `%cg` | Green |
| `%cb` | Blue | `%cy` | Yellow |
| `%cw` | White | `%cc` | Cyan |
| `%r`  | Newline | `%t` | Tab |

Use `u.util.center(title, 78, "=")` for section headers.

---

## Help file standards (non-negotiable)

Help files live in `src/help/` and are served in-game by the help-plugin
FileProvider via `registerHelpDir`.

### Width and length

- **Maximum line width: 78 characters.** Every line must fit within 78 printable
  characters. Use `u.util.center(title, 78, "=")` for section headers.
- **Maximum page length: 22 lines of content** (one terminal screen). Count blank
  lines. If a topic needs more space, split it.

### Splitting long topics

When a topic exceeds 22 lines, split into sub-files in a **subdirectory** named
after the topic:

```
src/help/
├── jobs.md              ← overview + quick-ref (≤22 lines)
└── jobs/
    ├── syntax.md        ← full syntax reference
    └── examples.md      ← extended examples
```

The overview file must end with a `SEE ALSO` line:

```
SEE ALSO: +help jobs/syntax, +help jobs/examples
```

Every sub-file should open with a back-reference:

```
See also: +help jobs (overview)
```

### File format

```
+TOPIC-NAME

One-sentence description of what **+topic-name** does; use `value` for examples.

SYNTAX
  +command[/switch] <required> [<optional>]

SWITCHES
  /switch    What this switch does.

EXAMPLES
  +command foo       Does the thing.
  +command/switch x  Does the other thing.

SEE ALSO: +help related-topic
```

- Title is `+TOPIC-NAME` ALL CAPS, flush left — no decorative border lines.
- Section labels (`SYNTAX`, `SWITCHES`, `EXAMPLES`, `SEE ALSO`) are ALL CAPS,
  flush left.
- Body text is indented 2 spaces.
- Exactly 1 blank line between sections.
- No line may exceed 78 characters — wrap prose at word boundaries.

### Markdown in body text

Help files render as markdown:

- `**bold**` → use for key terms, command names, important values.
- `` `backtick` `` → use for inline code, slugs, exact-match strings.
- Keep it subtle: one or two highlights per paragraph.
- **Do not use** `_italic_`, `### headings` (use ALL CAPS section labels),
  HTML, or tables.

---

## Test patterns

### Required boilerplate

```typescript
const OPTS = { sanitizeResources: false, sanitizeOps: false };
Deno.test("description", OPTS, async () => { /* ... */ });
```

### Required test cases for every command

- Happy path — correct output and DB call
- Null target — graceful not-found message, no DB write
- Permission denied — non-staff rejected on staff commands
- Job not found — graceful error, no DB write
- `stripSubs` called before DB ops

---

## Code style (non-negotiable)

- **Early return** over nested conditions
- **No function longer than 50 lines** — decompose
- **No file longer than 200 lines** — split
- **No bare `catch`** — always `catch (e: unknown)`
- **No deep nesting** — max 3 levels
- **No comments** unless the WHY is non-obvious

---

## Audit checklist (run mentally before every PR)

- [ ] `u.util.stripSubs()` on all user strings before DB ops or length checks
- [ ] All DB writes use `"$set"` / `"$inc"` / `"$unset"` — never raw overwrite
- [ ] `u.util.target()` result null-checked before use
- [ ] Admin-only actions check `u.me.flags` explicitly
- [ ] All `%c*` color codes closed with `%cn`
- [ ] Every `addCmd` has `help:` with syntax line + Switches section + ≥2 examples
- [ ] `jobHooks.on()` / `gameHooks.on()` in `init()` paired with matching `.off()`
      in `remove()` — same named function reference
- [ ] DBO collection names prefixed with `jobs.`
- [ ] REST route handlers return 401 before any work when `userId` is null
- [ ] `init()` returns `true`
- [ ] Every help file ≤ 22 content lines
- [ ] Every help file line ≤ 78 characters
- [ ] Multi-page topics linked with `SEE ALSO:`
- [ ] Sub-files open with a back-reference to the parent topic
- [ ] Help file body uses subtle markdown — no headings, no HTML

---

## PRs and commits

- No Claude/AI attribution in PR titles, commit messages, or code comments.
- Use squash-merge for feature PRs.
- Tag versions after squash-merge: `git tag v<version> && git push --tags`.
