// ─── Staff commands: +job / +jobs ────────────────────────────────────────────

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { jobs, jobArchive, isValidBucket, getAllBuckets, jobAccess } from "./db.ts";
import { jobHooks } from "./hooks.ts";
import type { IJob, IJobComment, IJobAccess } from "./types.ts";
import { isStaffFlags, header, footer, divider, jobHeader, jobFooter, jobDivider, formatTimeFull, formatDate, getEscalation, isNew, formatJobList, wrapText } from "./format.ts";
import { currentTheme, configTheme, saveThemeOverlay, resetThemeOverlay, DEFAULT_THEME } from "./theme.ts";

type TokenKey = keyof typeof DEFAULT_THEME.tokens;
const TOKEN_KEYS = Object.keys(DEFAULT_THEME.tokens) as TokenKey[];
import { getJobByNumber, canStaffSeeBucket } from "./job-utils.ts";
import { sendJobMail } from "./mail.ts";

/**
 * Returns the best available display name for the calling player.
 * Preference order: moniker → state.name → db name → "Unknown".
 */
function callerName(u: IUrsamuSDK): string {
  return (u.me.state?.moniker as string) || (u.me.state?.name as string) || u.me.name || "Unknown";
}

/**
 * Sends the staff job list to the calling player, filtered by bucket access
 * and optionally by a specific bucket name.
 *
 * Non-superusers only see buckets they have access to (per `server.jobs_access`).
 * If no jobs match the filter the player receives a "no open jobs" message.
 *
 * @param u            UrsaMU SDK context.
 * @param filterBucket Optional bucket name (uppercase) to restrict the listing.
 */
export async function listStaffJobs(u: IUrsamuSDK, filterBucket?: string): Promise<void> {
  if (!isStaffFlags(u.me.flags)) { u.send(">JOBS: Staff only."); return; }
  const allJobs = await jobs.find({});
  const isSU = u.me.flags.has("superuser");
  const visible: IJob[] = [];
  for (const j of allJobs) {
    if (filterBucket && j.bucket !== filterBucket) continue;
    if (await canStaffSeeBucket(u.me.id, j.bucket ?? j.category ?? "", isSU)) visible.push(j);
  }
  visible.sort((a, b) => a.number - b.number);
  if (visible.length === 0) {
    u.send(filterBucket ? `>JOBS: No open jobs in ${filterBucket}.` : ">JOBS: No open jobs.");
    return;
  }
  u.send(formatJobList(visible, filterBucket ? `+Jobs — ${filterBucket}` : "+Jobs").join("\n"));
}

addCmd({
  name: "+job",
  pattern: /^\+job(?!s)(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  help: `+job[/<switch>] [<args>]  — Staff job management commands.

Switches:
  /bucket <bucket>              Filter job list by bucket.
  /comment <#>=<text>           Add a staff comment to a job.
  /assign <#>=<staff>           Assign a job to a staff member.
  /close <#>[=<comment>]        Close and archive a job.
  /addplayer <player> to <#>    Add a viewer to a job.
  /addaccess <bucket>=<staff>   Grant staff access to a bucket. (superuser)
  /removeaccess <bucket>=<staff> Revoke bucket access. (superuser)
  /listaccess                   Show all bucket access settings. (superuser)
  /renumber                     Re-sequence all job numbers. (superuser)
  /claim <#>                        Claim a job for yourself.
  /unclaim <#>                      Release a claimed job.
  /resolve <#>[=<comment>]          Mark a job resolved and archive it.
  /reopen <#>                       Reopen an archived job.
  /delete <#>                       Permanently delete a job. (superuser)
  /priority <#>=<low|normal|high|critical>  Set job priority.
  /staffnote <#>=<text>             Add a staff-only note (hidden from player).

Examples:
  +job 5                    View job #5.
  +job/comment 5=On it.     Add a comment to job #5.
  +job/assign 5=Alice       Assign job #5 to Alice.
  +job/close 5=All done.    Close and archive job #5.`,
  exec: async (u: IUrsamuSDK) => {
    if (u.cmd.original?.trim().match(/^\+jobs\s*$/i)) { await listStaffJobs(u); return; }
    if (!isStaffFlags(u.me.flags)) { u.send(">JOBS: Staff only."); return; }

    const sw  = (u.cmd.args[0] || "").toLowerCase().trim();
    const arg = (u.cmd.args[1] || "").trim();

    if (!sw && arg && !arg.includes("=")) {
      const num = parseInt(arg, 10);
      if (!isNaN(num)) {
        const job = await getJobByNumber(num);
        if (!job) { u.send(`>JOBS: No job #${num} found.`); return; }
        if (!(await canStaffSeeBucket(u.me.id, job.bucket ?? job.category ?? "", u.me.flags.has("superuser")))) {
          u.send(">JOBS: You don't have access to that bucket."); return;
        }
        const esc = getEscalation(job);
        const bucket = job.bucket || job.category || "???";
        const statusLabel = esc.label ? `${esc.color}${esc.label}%cn` : "";
        const newTag = isNew(job) ? " (NEW)" : "";
        const LBL = 11; const VAL = 30;
        const pad = (s: string) => s.padEnd(LBL);
        const lines = [
          jobHeader(`Job ${job.number}`),
          `%cc${pad("Job Title:")}%cn${job.title.padEnd(VAL)}%cc${pad("Requester:")}%cn${job.submitterName}`,
          `%cc${pad("Category:")}%cn${bucket.padEnd(VAL)}%cc${pad("Status:")}%cn${statusLabel}${newTag}`,
          `%cc${pad("Created:")}%cn${formatTimeFull(job.createdAt).padEnd(VAL)}%cc${pad("Handler:")}%cn${job.assigneeName || "-----"}`,
          `%cc${"Additional Players:"}%cn ${job.additionalPlayers?.join(", ") || ""}`,
          jobDivider(),
          ...wrapText(job.description),
        ];
        if (job.comments.length > 0) {
          for (const c of job.comments) {
            const tag = c.staffOnly ? " %ch%cr[STAFF]%cn" : "";
            lines.push(jobDivider());
            lines.push(`  %ch%cy${c.authorName}%cn${tag} commented on ${formatDate(c.timestamp)}:`);
            lines.push(...wrapText(c.text));
          }
        }
        lines.push(jobFooter());
        u.send(lines.join("\n"));
        return;
      }
    }

    if (sw === "bucket") {
      const bucket = arg.toUpperCase();
      if (!isValidBucket(bucket)) { u.send(`>JOBS: Invalid bucket. Valid: ${getAllBuckets().join(", ")}`); return; }
      await listStaffJobs(u, bucket);
      return;
    }

    if (sw === "comment") {
      const eq = arg.indexOf("=");
      if (eq === -1) { u.send("Usage: +job/comment <#>=<text>"); return; }
      const num  = parseInt(arg.slice(0, eq).trim(), 10);
      const text = u.util.stripSubs(arg.slice(eq + 1).trim());
      if (isNaN(num) || !text) { u.send("Usage: +job/comment <#>=<text>"); return; }
      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No job #${num} found.`); return; }
      const authorName = callerName(u);
      const comment: IJobComment = { authorId: u.me.id, authorName, text, timestamp: Date.now(), staffOnly: false };
      job.comments.push(comment); job.updatedAt = Date.now();
      await jobs.update({ id: job.id }, job);
      await jobHooks.emit("job:commented", job, comment);
      u.send(`>JOBS: Comment added to job #${num}.`);
      if (job.submittedBy !== u.me.id) {
        await sendJobMail(u.me.id, job.submittedBy, `Job #${num}: ${job.title}`,
          `${authorName} commented on your request #${num}:\n\n${text}`);
      }
      return;
    }

    if (sw === "assign") {
      const eq = arg.indexOf("=");
      if (eq === -1) { u.send("Usage: +job/assign <#>=<staff>"); return; }
      const num  = parseInt(arg.slice(0, eq).trim(), 10);
      const name = arg.slice(eq + 1).trim();
      if (isNaN(num) || !name) { u.send("Usage: +job/assign <#>=<staff>"); return; }
      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No job #${num} found.`); return; }
      const target = await u.util.target(u.me, name);
      if (!target) { u.send(`>JOBS: Player "${name}" not found.`); return; }
      if (!target.flags.has("superuser") && !target.flags.has("admin") && !target.flags.has("wizard")) {
        u.send(`>JOBS: ${name} is not a staff member.`); return;
      }
      job.assignedTo = target.id;
      job.assigneeName = (target.state?.moniker as string) || (target.state?.name as string) || target.name || "Unknown";
      job.updatedAt = Date.now();
      await jobs.update({ id: job.id }, job);
      await jobHooks.emit("job:assigned", job);
      u.send(`>JOBS: Job #${num} assigned to ${job.assigneeName}.`);
      return;
    }

    if (sw === "close") {
      const eq     = arg.indexOf("=");
      const numStr = eq !== -1 ? arg.slice(0, eq).trim() : arg;
      const reason = eq !== -1 ? arg.slice(eq + 1).trim() : "";
      const num = parseInt(numStr, 10);
      if (isNaN(num)) { u.send("Usage: +job/close <#>[=<comment>]"); return; }
      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No job #${num} found.`); return; }
      const closerName = callerName(u);
      if (reason) {
        job.comments.push({ authorId: u.me.id, authorName: closerName, text: reason, timestamp: Date.now(), staffOnly: false });
      }
      job.status = "closed"; job.closedByName = closerName; job.updatedAt = Date.now();
      await jobArchive.create({ ...job });
      await jobs.delete({ id: job.id });
      await jobHooks.emit("job:closed", job);
      u.send(`>JOBS: Job #${num} closed and archived.`);
      if (job.submittedBy !== u.me.id) {
        let body = `${closerName} has completed your request.\n\n${job.description}`;
        if (reason) body += `\n\nFinal Comment:\n${closerName} [${formatDate(Date.now())}]: ${reason}`;
        await sendJobMail(u.me.id, job.submittedBy, `Request #${num} Completed: ${job.title}`, body);
      }
      return;
    }

    if (sw === "addplayer") {
      const match = arg.match(/^(.+?)\s+to\s+(\d+)\s*$/i);
      if (!match) { u.send("Usage: +job/addplayer <player> to <#>"); return; }
      const playerName = match[1].trim();
      const num = parseInt(match[2], 10);
      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No job #${num} found.`); return; }
      const target = await u.util.target(u.me, playerName);
      if (!target) { u.send(`>JOBS: Player "${playerName}" not found.`); return; }
      if (!job.additionalPlayers) job.additionalPlayers = [];
      if (job.additionalPlayers.includes(target.id)) { u.send(`>JOBS: ${target.name} already added.`); return; }
      job.additionalPlayers.push(target.id); job.updatedAt = Date.now();
      await jobs.update({ id: job.id }, job);
      u.send(`>JOBS: ${target.name} added to job #${num}.`);
      await sendJobMail(u.me.id, target.id, `Added to Job #${num}`, `You have been added as a viewer to Job #${num}: ${job.title}`);
      return;
    }

    if (sw === "addaccess") {
      if (!u.me.flags.has("superuser")) { u.send(">JOBS: Superuser only."); return; }
      const eq = arg.indexOf("=");
      if (eq === -1) { u.send("Usage: +job/addaccess <bucket>=<staff>"); return; }
      const bucket    = arg.slice(0, eq).trim().toUpperCase();
      const staffName = arg.slice(eq + 1).trim();
      if (!isValidBucket(bucket)) { u.send(`>JOBS: Invalid bucket. Valid: ${getAllBuckets().join(", ")}`); return; }
      const target = await u.util.target(u.me, staffName);
      if (!target) { u.send(`>JOBS: Staff "${staffName}" not found.`); return; }
      const access = await jobAccess.queryOne({ id: bucket });
      if (!access) {
        await jobAccess.create({ id: bucket, staffIds: [target.id] });
      } else if (!access.staffIds.includes(target.id)) {
        access.staffIds.push(target.id);
        await jobAccess.update({ id: access.id }, access);
      }
      u.send(`>JOBS: ${target.name} granted access to ${bucket} bucket.`);
      return;
    }

    if (sw === "removeaccess") {
      if (!u.me.flags.has("superuser")) { u.send(">JOBS: Superuser only."); return; }
      const eq = arg.indexOf("=");
      if (eq === -1) { u.send("Usage: +job/removeaccess <bucket>=<staff>"); return; }
      const bucket    = arg.slice(0, eq).trim().toUpperCase();
      const staffName = arg.slice(eq + 1).trim();
      const target = await u.util.target(u.me, staffName);
      if (!target) { u.send(`>JOBS: Staff "${staffName}" not found.`); return; }
      const access = await jobAccess.queryOne({ id: bucket });
      if (access?.staffIds.includes(target.id)) {
        access.staffIds = access.staffIds.filter((id: string) => id !== target.id);
        await jobAccess.update({ id: access.id }, access);
      }
      u.send(`>JOBS: ${target.name} removed from ${bucket} bucket.`);
      return;
    }

    if (sw === "listaccess") {
      if (!u.me.flags.has("superuser")) { u.send(">JOBS: Superuser only."); return; }
      const allAccess = await jobAccess.find({});
      const lines = [header("Bucket Access")];
      for (const bucket of getAllBuckets()) {
        const entry = allAccess.find((a: IJobAccess) => a.id === bucket);
        lines.push(` ${bucket.padEnd(14)} ${entry?.staffIds.length ? entry.staffIds.join(", ") : "(all staff)"}`);
      }
      lines.push(footer());
      u.send(lines.join("\n"));
      return;
    }

    if (sw === "renumber") {
      if (!u.me.flags.has("superuser")) { u.send(">JOBS: Superuser only."); return; }
      const allJobs = (await jobs.find({})).sort((a, b) => a.number - b.number);
      for (const j of allJobs) await jobs.delete({ id: j.id });
      let n = 1;
      for (const j of allJobs) { j.number = n; j.id = `job-${n}`; n++; await jobs.create(j); }
      u.send(`>JOBS: ${allJobs.length} jobs renumbered.`);
      return;
    }

    if (sw === "claim") {
      const num = parseInt(arg, 10);
      if (isNaN(num)) { u.send("Usage: +job/claim <#>"); return; }
      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No job #${num} found.`); return; }
      if (!(await canStaffSeeBucket(u.me.id, job.bucket ?? job.category ?? "", u.me.flags.has("superuser")))) {
        u.send(">JOBS: You don't have access to that bucket."); return;
      }
      job.assignedTo = u.me.id;
      job.assigneeName = callerName(u);
      job.status = "open";
      job.updatedAt = Date.now();
      await jobs.update({ id: job.id }, job);
      await jobHooks.emit("job:assigned", job);
      u.send(`>JOBS: Job #${num} claimed.`);
      return;
    }

    if (sw === "unclaim") {
      const num = parseInt(arg, 10);
      if (isNaN(num)) { u.send("Usage: +job/unclaim <#>"); return; }
      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No job #${num} found.`); return; }
      job.assignedTo = undefined;
      job.assigneeName = undefined;
      job.status = "new";
      job.updatedAt = Date.now();
      await jobs.update({ id: job.id }, job);
      u.send(`>JOBS: Job #${num} unclaimed.`);
      return;
    }

    if (sw === "resolve") {
      const eq = arg.indexOf("=");
      const numStr = eq !== -1 ? arg.slice(0, eq).trim() : arg;
      const reason = eq !== -1 ? arg.slice(eq + 1).trim() : "";
      const num = parseInt(numStr, 10);
      if (isNaN(num)) { u.send("Usage: +job/resolve <#>[=<comment>]"); return; }
      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No job #${num} found.`); return; }
      const resolverName = callerName(u);
      if (reason) {
        job.comments.push({ authorId: u.me.id, authorName: resolverName, text: reason, timestamp: Date.now(), staffOnly: false });
      }
      job.status = "resolved";
      job.closedByName = resolverName;
      job.updatedAt = Date.now();
      await jobArchive.create({ ...job });
      await jobs.delete({ id: job.id });
      await jobHooks.emit("job:resolved", job);
      u.send(`>JOBS: Job #${num} resolved and archived.`);
      if (job.submittedBy !== u.me.id) {
        let body = `${resolverName} has resolved your request.\n\n${job.description}`;
        if (reason) body += `\n\nResolution:\n${resolverName}: ${reason}`;
        await sendJobMail(u.me.id, job.submittedBy, `Request #${num} Resolved: ${job.title}`, body);
      }
      return;
    }

    if (sw === "reopen") {
      const num = parseInt(arg, 10);
      if (isNaN(num)) { u.send("Usage: +job/reopen <#>"); return; }
      const archived = await jobArchive.find({});
      const job = archived.find((j: IJob) => j.number === num);
      if (!job) { u.send(`>JOBS: No archived job #${num} found.`); return; }
      job.status = "open";
      job.closedByName = undefined;
      job.updatedAt = Date.now();
      await jobs.create(job);
      await jobArchive.delete({ id: job.id });
      await jobHooks.emit("job:reopened", job);
      u.send(`>JOBS: Job #${num} reopened.`);
      return;
    }

    if (sw === "delete") {
      if (!u.me.flags.has("superuser")) { u.send(">JOBS: Superuser only."); return; }
      const num = parseInt(arg, 10);
      if (isNaN(num)) { u.send("Usage: +job/delete <#>"); return; }
      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No job #${num} found.`); return; }
      await jobs.delete({ id: job.id });
      await jobHooks.emit("job:deleted", job);
      u.send(`>JOBS: Job #${num} permanently deleted.`);
      return;
    }

    if (sw === "priority") {
      const eq = arg.indexOf("=");
      if (eq === -1) { u.send("Usage: +job/priority <#>=<low|normal|high|critical>"); return; }
      const num = parseInt(arg.slice(0, eq).trim(), 10);
      const level = arg.slice(eq + 1).trim().toLowerCase();
      if (isNaN(num)) { u.send("Usage: +job/priority <#>=<low|normal|high|critical>"); return; }
      if (!["low", "normal", "high", "critical"].includes(level)) {
        u.send(">JOBS: Priority must be: low, normal, high, or critical."); return;
      }
      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No job #${num} found.`); return; }
      const oldPriority = job.priority ?? "normal";
      job.priority = level as IJob["priority"];
      job.updatedAt = Date.now();
      await jobs.update({ id: job.id }, job);
      await jobHooks.emit("job:priority-changed", job, oldPriority);
      u.send(`>JOBS: Job #${num} priority set to ${level}.`);
      return;
    }

    if (sw === "staffnote") {
      const eq = arg.indexOf("=");
      if (eq === -1) { u.send("Usage: +job/staffnote <#>=<text>"); return; }
      const num  = parseInt(arg.slice(0, eq).trim(), 10);
      const text = u.util.stripSubs(arg.slice(eq + 1).trim());
      if (isNaN(num) || !text) { u.send("Usage: +job/staffnote <#>=<text>"); return; }
      const job = await getJobByNumber(num);
      if (!job) { u.send(`>JOBS: No job #${num} found.`); return; }
      const comment: IJobComment = { authorId: u.me.id, authorName: callerName(u), text, timestamp: Date.now(), staffOnly: true };
      job.comments.push(comment);
      job.updatedAt = Date.now();
      await jobs.update({ id: job.id }, job);
      await jobHooks.emit("job:commented", job, comment);
      u.send(`>JOBS: Staff note added to job #${num}.`);
      return;
    }

    if (sw === "theme") {
      if (!isStaffFlags(u.me.flags)) { u.send(">JOBS: Staff only."); return; }
      const resolved = currentTheme();
      const cfg      = configTheme();
      const src = (val: string, cfgVal: string, defVal: string): string => {
        if (val !== cfgVal)  return "%cy[game]%cn";
        if (val !== defVal)  return "%cg[config]%cn";
        return "%cw[default]%cn";
      };
      const lines = [
        header("Jobs Theme"),
        "  %ch%cy[game]%cn = in-game   %cg[config]%cn = config file   %cw[default]%cn = built-in",
        divider("Tokens"),
        ...TOKEN_KEYS.map((k) =>
          `  %ch%cw${k.padEnd(8)}%cn  ${resolved.tokens[k] || "(empty)"}  ${src(resolved.tokens[k], cfg.tokens[k], DEFAULT_THEME.tokens[k])}`
        ),
        footer(),
      ];
      u.send(lines.join("\n"));
      return;
    }

    if (sw === "theme/set") {
      if (!isStaffFlags(u.me.flags)) { u.send(">JOBS: Staff only."); return; }
      const eq = arg.indexOf("=");
      if (eq === -1) { u.send("Usage: +job/theme/set <token>=<value>"); return; }
      const key   = arg.slice(0, eq).trim().toLowerCase() as TokenKey;
      const value = arg.slice(eq + 1);
      if (!TOKEN_KEYS.includes(key)) {
        u.send(`%crUnknown token '%cn${key}%cr'. Valid: ${TOKEN_KEYS.join(", ")}%cn`);
        return;
      }
      await saveThemeOverlay({ tokens: { [key]: value } });
      u.send(`%chToken '%cn${key}%ch' updated.%cn`);
      return;
    }

    if (sw === "theme/reset") {
      if (!isStaffFlags(u.me.flags)) { u.send(">JOBS: Staff only."); return; }
      await resetThemeOverlay();
      u.send("%chIn-game theme overrides cleared. Restored to config file / defaults.%cn");
      return;
    }

    u.send(">JOBS: Staff commands:");
    u.send("  +jobs                              - list all open jobs");
    u.send("  +job <#>                           - view a job");
    u.send("  +job/bucket <bucket>               - filter by bucket");
    u.send("  +job/comment <#>=<text>            - add comment");
    u.send("  +job/assign <#>=<staff>            - assign job");
    u.send("  +job/close <#>[=<comment>]         - close and archive");
    u.send("  +job/addplayer <player> to <#>     - add viewer");
    u.send("  +job/addaccess <bucket>=<staff>    - grant bucket access");
    u.send("  +job/removeaccess <bucket>=<staff> - revoke access");
    u.send("  +job/listaccess                    - show access map");
    u.send("  +job/renumber                      - resequence IDs");
    u.send("  +job/claim <#>                    - claim job");
    u.send("  +job/unclaim <#>                  - unclaim job");
    u.send("  +job/resolve <#>[=<comment>]      - resolve and archive");
    u.send("  +job/reopen <#>                   - reopen archived job");
    u.send("  +job/delete <#>                   - permanently delete (superuser)");
    u.send("  +job/priority <#>=<level>         - set priority");
    u.send("  +job/staffnote <#>=<text>         - staff-only note");
    u.send("  +job/theme                        - show display theme");
    u.send("  +job/theme/set <token>=<value>    - update a theme token");
    u.send("  +job/theme/reset                  - restore default theme");
  },
});

addCmd({
  name: "+jobs",
  pattern: /^\+jobs\s*$/i,
  lock: "connected",
  help: `+jobs  — List all open jobs (staff only).

Examples:
  +jobs   Show all open jobs visible to your role.
  +jobs   Superusers see every bucket; others only see their permitted buckets.`,
  exec: async (u: IUrsamuSDK) => { await listStaffJobs(u); },
});

