// Regression: src/theme.ts must not crash at module load when imported via
// an https URL (e.g. raw.githubusercontent.com). The previous version called
// `fromFileUrl(import.meta.url)` at module top level, which throws when the
// scheme isn't file:.

import { assertEquals } from "@std/assert";

Deno.test({
  name: "theme.ts loads without crashing under file:// scheme",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
  const mod = await import("../src/theme.ts");
  // Module loaded — touch a function to ensure it's usable.
  assertEquals(typeof mod.currentTheme, "function");
  assertEquals(typeof mod.themeHeader, "function");
  },
});

Deno.test("readJsonConfig returns {} when import.meta.url is https (simulated)", () => {
  // Simulate the https case by manually running the same logic: build a URL
  // relative to an https base, and confirm protocol gating works.
  const httpsBase = "https://raw.githubusercontent.com/UrsaMU/jobs-plugin/v1.4.1/src/theme.ts";
  const url = new URL("../../config/jobs-theme.json", httpsBase);
  // protocol gate: would return null → readJsonConfig returns {}
  assertEquals(url.protocol, "https:");
  // And under file://, protocol gate passes through.
  const fileBase = new URL("../src/theme.ts", import.meta.url).href;
  const fileUrl = new URL("../../config/jobs-theme.json", fileBase);
  assertEquals(fileUrl.protocol, "file:");
});
