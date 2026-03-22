/**
 * @module @ursamu/jobs-plugin
 * @description Anomaly-style jobs/request system for UrsaMU.
 *
 * Re-exports the engine's job domain types and hooks for convenience, plus
 * provides the plugin entry point that wires up in-game commands, REST routes,
 * and staff notifications.
 *
 * Install via `plugins.manifest.json`:
 * ```json
 * { "plugins": [{ "name": "jobs", "url": "https://github.com/UrsaMU/jobs-plugin", "ref": "v1.0.0" }] }
 * ```
 *
 * Or consume the hooks/types in another plugin:
 * ```ts
 * import { jobHooks } from "@ursamu/ursamu/jobs";
 * jobHooks.on("job:created", (job) => console.log(job.title));
 * ```
 */

// Re-export domain types and hooks from the engine's ./jobs sub-path
// so dependents can use @ursamu/jobs-plugin as their single import.
export { jobHooks, jobs, jobArchive, jobAccess, getNextJobNumber, registerJobBuckets, isValidBucket, getAllBuckets, getBucketStaffIds } from "@ursamu/ursamu/jobs";
export type { IJob, IJobComment, IJobAccess } from "@ursamu/ursamu/jobs";

// Plugin entry point
export { default } from "./src/index.ts";
