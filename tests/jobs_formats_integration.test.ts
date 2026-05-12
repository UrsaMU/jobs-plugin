/**
 * Integration test: @joblistformat / @jobrowformat attributes evaluated through
 * the REAL TinyMUX softcode engine (via `resolveFormat`), and the plugin
 * handler fallback path via `registerFormatHandler`.
 *
 * Mirrors `tests/look_formats_integration.test.ts` in ursamu — numeric ids so
 * softcode #N dbref resolution works.
 *
 * %0 carries the default-rendered string (block or single row).
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { dbojs, DBO } from "@ursamu/ursamu/dbojs";
import { createNativeSDK } from "@ursamu/ursamu/sdk";
import {
  registerFormatHandler,
  unregisterFormatHandler,
  _clearFormatHandlers,
  type FormatSlot,
} from "@ursamu/ursamu/format-handlers";

import { renderJobList } from "../src/format.ts";
import type { IJob } from "../src/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const SLOW = { timeout: 15000 };

// Numeric ids so softcode #N dbref resolution (name(%i0), etc.) works.
const ROOT  = "0";
const ACTOR = "910001";

function makeJob(overrides: Partial<IJob> = {}): IJob {
  return {
    id: "job-1", number: 1, title: "Test Issue",
    bucket: "BUG", status: "open",
    submittedBy: ACTOR, submitterName: "Alice",
    description: "Something broke.", comments: [],
    createdAt: 1700000000000, updatedAt: 1700000000000,
    ...overrides,
  };
}

async function cleanup() {
  for (const id of [ROOT, ACTOR]) {
    await dbojs.delete({ id }).catch(() => {});
  }
}

async function seed(opts: { rootAttrs?: Record<string, string>; actorAttrs?: Record<string, string> } = {}) {
  await cleanup();
  _clearFormatHandlers();
  const toAttrs = (m: Record<string, string> | undefined, setter: string) =>
    Object.entries(m ?? {}).map(([name, value]) => ({ name, value, setter, type: "attribute" }));
  await dbojs.create({
    id: ROOT,
    flags: "room",
    data: { name: "Master Room", attributes: toAttrs(opts.rootAttrs, ACTOR) },
  });
  await dbojs.create({
    id: ACTOR,
    flags: "player connected wizard",
    data: { name: "Alice", attributes: toAttrs(opts.actorAttrs, ACTOR) },
    location: ROOT,
  });
}

async function runRender(jobs: IJob[]): Promise<string> {
  const u = await createNativeSDK("jfi-sock", ACTOR, { name: "+jobs", original: "+jobs", args: [""], switches: [] });
  return await renderJobList(u, jobs, "+Jobs");
}

Deno.test("jobs format: no attrs, no plugin handler — default rendering", { ...OPTS, ...SLOW }, async () => {
  await seed();
  const out = await runRender([makeJob()]);
  assertStringIncludes(out, "+Jobs");           // header title present
  assertStringIncludes(out, "Test Issue");      // title row present
  assertStringIncludes(out, "BUG");             // bucket
  await cleanup();
});

Deno.test("jobs format: @joblistformat wraps the whole block via %0", { ...OPTS, ...SLOW }, async () => {
  await seed({ actorAttrs: { JOBLISTFORMAT: "<<%0>>" } });
  const out = await runRender([makeJob()]);
  assertStringIncludes(out, "<<");
  assertStringIncludes(out, ">>");
  assertStringIncludes(out, "Test Issue");
  await cleanup();
});

Deno.test("jobs format: @jobrowformat overrides each row, %0 = default row", { ...OPTS, ...SLOW }, async () => {
  await seed({ actorAttrs: { JOBROWFORMAT: "ROW(%0)" } });
  const out = await runRender([makeJob(), makeJob({ id: "job-2", number: 2, title: "Other" })]);
  assertStringIncludes(out, "ROW(");
  assertStringIncludes(out, "Test Issue");
  assertStringIncludes(out, "Other");
  // Two rows -> two ROW( markers
  assertEquals(out.match(/ROW\(/g)?.length, 2);
  await cleanup();
});

Deno.test("jobs format: two-tier lookup — #0 attr wins over enactor when both set", { ...OPTS, ...SLOW }, async () => {
  await seed({
    rootAttrs:  { JOBLISTFORMAT: "ROOT(%0)" },
    actorAttrs: { JOBLISTFORMAT: "SELF(%0)" },
  });
  const out = await runRender([makeJob()]);
  assertStringIncludes(out, "ROOT(");
  assertEquals(out.includes("SELF("), false);
  await cleanup();
});

Deno.test("jobs format: two-tier lookup — falls through to enactor when #0 unset", { ...OPTS, ...SLOW }, async () => {
  await seed({ actorAttrs: { JOBLISTFORMAT: "SELF(%0)" } });
  const out = await runRender([makeJob()]);
  assertStringIncludes(out, "SELF(");
  await cleanup();
});

Deno.test("jobs format: plugin handler fallback when no softcode attr set", { ...OPTS, ...SLOW }, async () => {
  await seed();
  const handler = (_u: unknown, _t: unknown, arg: string) => `PLUGIN[${arg}]`;
  registerFormatHandler("JOBLISTFORMAT" as FormatSlot, handler);
  try {
    const out = await runRender([makeJob()]);
    assertStringIncludes(out, "PLUGIN[");
    assertStringIncludes(out, "Test Issue"); // default block was passed in as %0
  } finally {
    unregisterFormatHandler("JOBLISTFORMAT" as FormatSlot, handler);
    await cleanup();
    await DBO.close();
  }
});
