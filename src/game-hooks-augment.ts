// Extends GameHookMap with job lifecycle events via TypeScript declaration merging.
// Import this file once (in hooks.ts) to activate the augmentation engine-wide.
//
// Once activated, any plugin can listen with no jobs import required:
//   import { gameHooks } from "@ursamu/ursamu";
//   gameHooks.on("job:created", (job) => console.log(job.title));

import type { IJob, IJobComment } from "./types.ts";

declare module "@ursamu/ursamu" {
  interface GameHookMap {
    /** A new job was submitted by a player. */
    "job:created":          (job: IJob)                            => void | Promise<void>;
    /** A comment or staff note was added to a job. */
    "job:commented":        (job: IJob, comment: IJobComment)      => void | Promise<void>;
    /** Job status changed — `oldStatus` is the previous value. */
    "job:status-changed":   (job: IJob, oldStatus: string)         => void | Promise<void>;
    /** Job was assigned to a staff member. */
    "job:assigned":         (job: IJob)                            => void | Promise<void>;
    /** Job priority changed — `oldPriority` is the previous value. */
    "job:priority-changed": (job: IJob, oldPriority: string)       => void | Promise<void>;
    /** Job was marked closed. */
    "job:closed":           (job: IJob)                            => void | Promise<void>;
    /** Job was marked resolved. */
    "job:resolved":         (job: IJob)                            => void | Promise<void>;
    /** A closed/resolved job was reopened. */
    "job:reopened":         (job: IJob)                            => void | Promise<void>;
    /** Job was permanently deleted. */
    "job:deleted":          (job: IJob)                            => void | Promise<void>;
  }
}
