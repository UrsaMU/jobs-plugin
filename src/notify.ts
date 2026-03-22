// ─── Staff notification for new jobs ─────────────────────────────────────────

import { jobHooks } from "./hooks.ts";
import { wsService, send, dbojs } from "@ursamu/ursamu";
import type { IJob } from "./types.ts";

const STAFF_FLAGS = ["superuser", "admin", "wizard"] as const;

/**
 * Handler registered on job:created — sends an in-game message to all
 * connected staff members (excluding the submitter) when a new job arrives.
 */
const onJobCreated = async (job: IJob): Promise<void> => {
  const sockets = wsService.getConnectedSockets();
  const notified = new Set<string>();
  for (const sock of sockets) {
    if (!sock.cid || sock.cid === job.submittedBy || notified.has(sock.cid)) continue;
    const playerObj = await dbojs.queryOne({ id: sock.cid });
    if (!playerObj) continue;
    // Split flag string into a Set — prevents substring bypass (e.g. "notsuperuser")
    const flagSet = new Set((playerObj.flags || "").split(" ").filter(Boolean));
    if (STAFF_FLAGS.some((f) => flagSet.has(f))) {
      send(
        [sock.id],
        `%ch>JOBS:%cn New ${job.bucket} job #${job.number}: "${job.title}" from ${job.submitterName}.`,
      );
      notified.add(sock.cid);
    }
  }
};

/** Wire up the job:created notification hook. */
export function registerNotifyHooks(): void {
  jobHooks.on("job:created", onJobCreated);
}

/** Remove the job:created notification hook (called on plugin remove). */
export function removeNotifyHooks(): void {
  jobHooks.off("job:created", onJobCreated);
}
