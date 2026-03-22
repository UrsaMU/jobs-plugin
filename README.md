# @ursamu/jobs-plugin

> Anomaly-style jobs/request tracking system for UrsaMU — player requests, staff commands, bucket access control, archive, and REST API.

## Install

Add to your game project's `plugins.manifest.json`:

```json
{
  "plugins": [
    { "name": "jobs", "url": "https://github.com/UrsaMU/jobs-plugin", "ref": "v1.0.0" }
  ]
}
```

The engine's `ensurePlugins()` will clone and load it automatically on next restart.

## Commands

### Player Commands

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+request` | `+request <title>=<text>` | connected | Submit a request to the default (SPHERE) bucket |
| `+request` | `+request/create <bucket>/<title>=<text>` | connected | Submit to a specific bucket |
| `+request` | `+request <#>` | connected | View one of your requests |
| `+request` | `+request/comment <#>=<text>` | connected | Add a comment |
| `+request` | `+request/cancel <#>` | connected | Cancel your own request |
| `+request` | `+request/addplayer <#>=<player>` | connected | Add another player as a viewer |
| `+requests` | `+requests` | connected | List all your open requests |
| `+myjobs` | `+myjobs` | connected | Alias for `+requests`; superusers see all jobs |

### Staff Commands

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+jobs` | `+jobs` | connected (staff) | List all open jobs |
| `+job` | `+job <#>` | connected (staff) | View a job with all comments |
| `+job` | `+job/bucket <bucket>` | connected (staff) | Filter job list by bucket |
| `+job` | `+job/comment <#>=<text>` | connected (staff) | Add a staff comment; mails the requester |
| `+job` | `+job/assign <#>=<staff>` | connected (staff) | Assign a job |
| `+job` | `+job/close <#>[=<comment>]` | connected (staff) | Close, archive, and mail the requester |
| `+job` | `+job/addplayer <player> to <#>` | connected (staff) | Add a viewer |
| `+job` | `+job/addaccess <bucket>=<staff>` | superuser | Grant staff access to a bucket |
| `+job` | `+job/removeaccess <bucket>=<staff>` | superuser | Revoke bucket access |
| `+job` | `+job/listaccess` | superuser | Show all bucket access settings |
| `+job` | `+job/renumber` | superuser | Re-sequence all job numbers |

### Archive Commands

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+archive` | `+archive` | connected (staff) | List all archived jobs |
| `+archive` | `+archive <#>` | connected (staff) | View an archived job |
| `+archive` | `+archive/purge <#>` | superuser | Permanently delete one archived job |
| `+archive` | `+archive/purgeall CONFIRM` | superuser | Delete all archived jobs |

## REST Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/jobs` | Bearer | List jobs (staff sees all; players see own) |
| `POST` | `/api/v1/jobs` | Bearer | Create a job |
| `GET` | `/api/v1/jobs/stats` | Bearer (staff) | Aggregate stats by status/category/priority |
| `GET` | `/api/v1/jobs/:id` | Bearer | Get a single job (by number or UUID) |
| `PATCH` | `/api/v1/jobs/:id` | Bearer (staff) | Update status/priority/assignedTo/title/desc |
| `DELETE` | `/api/v1/jobs/:id` | Bearer (staff) | Delete a job and fire job:deleted hook |
| `POST` | `/api/v1/jobs/:id/comment` | Bearer | Add a comment |

### Query parameters — `GET /api/v1/jobs`

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status (`new`, `open`, `closed`, `resolved`, `cancelled`) |
| `category` | string | Filter by category/bucket name |
| `priority` | string | Filter by priority (`low`, `normal`, `high`) |
| `assignedTo` | string | Filter by assigned staff player ID |
| `submittedBy` | string | Filter by submitter player ID |
| `limit` | number | Max results to return (default 50, max 200) |
| `offset` | number | Pagination offset (default 0) |

### Request/response bodies

**`POST /api/v1/jobs`** — body:
```json
{
  "title": "Login page is broken",
  "description": "Getting a 500 when I click sign in.",
  "category": "bug",
  "priority": "high",
  "staffOnly": false
}
```
Response `201`: the full `IJob` object.

**`PATCH /api/v1/jobs/:id`** — body (all fields optional):
```json
{
  "status": "closed",
  "priority": "normal",
  "assignedTo": "player-id",
  "title": "Updated title",
  "description": "Updated description"
}
```
Response `200`: the updated `IJob` object.

**`POST /api/v1/jobs/:id/comment`** — body:
```json
{
  "text": "Working on it now.",
  "staffOnly": false
}
```
Response `201`: the created `IJobComment` object.

**`GET /api/v1/jobs/stats`** — response `200`:
```json
{
  "total": 42,
  "byStatus": { "open": 30, "closed": 12 },
  "byCategory": { "bug": 10, "request": 32 },
  "byPriority": { "normal": 35, "high": 7 },
  "openAssigned": 15,
  "openUnassigned": 15
}
```

## Events

Other plugins can subscribe to job lifecycle events via `jobHooks`:

```ts
import { jobHooks } from "@ursamu/jobs-plugin";

jobHooks.on("job:created",  (job) => { /* notify Discord */ });
jobHooks.on("job:closed",   (job) => { /* send mail */ });
jobHooks.on("job:commented",(job, comment) => { /* relay */ });
```

| Event | Payload | When fired |
|-------|---------|-----------|
| `job:created` | `(job)` | New job submitted |
| `job:commented` | `(job, comment)` | Comment added |
| `job:status-changed` | `(job, oldStatus)` | Status updated (not closed/resolved) |
| `job:assigned` | `(job)` | Job assigned to staff |
| `job:priority-changed` | `(job, oldPriority)` | Priority changed |
| `job:closed` | `(job)` | Job closed/cancelled |
| `job:resolved` | `(job)` | Job marked resolved |
| `job:reopened` | `(job)` | Closed/resolved job reopened |
| `job:deleted` | `(job)` | Job permanently deleted |

## Storage

All collections share the same Deno KV instance as the engine:

| Collection | Schema | Purpose |
|------------|--------|---------|
| `server.jobs` | `IJob` | Active jobs |
| `server.jobs_archive` | `IJob` | Closed/cancelled jobs |
| `server.jobs_access` | `IJobAccess` | Per-bucket staff access lists |
| `server.counters["jobid"]` | number | Auto-increment job number |
| `server.mail` | `IMail` | Outgoing job notification mails |

### `IJob` schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique ID, e.g. `"job-42"` |
| `number` | `number` | Sequential job number |
| `title` | `string` | Job title |
| `bucket` | `string` | In-game bucket (BUG, PLOT, etc.) |
| `category` | `string` | REST API category label |
| `status` | `"new" \| "open" \| "closed" \| "cancelled" \| "resolved"` | Current status |
| `priority` | `"low" \| "normal" \| "high"` | Priority level |
| `description` | `string` | Full description text |
| `submittedBy` | `string` | Player ID of submitter |
| `submitterName` | `string` | Display name of submitter |
| `assignedTo` | `string?` | Player ID of assigned staff |
| `assigneeName` | `string?` | Display name of assigned staff |
| `comments` | `IJobComment[]` | All comments (staff-only filtered for players) |
| `additionalPlayers` | `string[]?` | Player IDs granted view access |
| `staffOnly` | `boolean?` | REST API: hidden from non-staff |
| `closedByName` | `string?` | Display name of who closed the job |
| `createdAt` | `number` | Unix timestamp — job creation |
| `updatedAt` | `number` | Unix timestamp — last modification |

### `IJobComment` schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string?` | UUID (REST API only) |
| `authorId` | `string` | Player ID of comment author |
| `authorName` | `string` | Display name of comment author |
| `text` | `string` | Comment text |
| `timestamp` | `number` | Unix timestamp |
| `published` | `boolean?` | Visible to job submitter (in-game) |
| `staffOnly` | `boolean?` | Visible to staff only (REST API) |

## Buckets

Register custom buckets from your game project's `init` code:

```ts
import { registerJobBuckets } from "@ursamu/jobs-plugin";

// Plain list — open to all staff
registerJobBuckets(["PLOT", "BUILD"]);

// With per-bucket staff restrictions (seeded on first startup)
registerJobBuckets([{ name: "CGEN", staffIds: ["#5", "#7"] }]);
```

Built-in buckets: `BUG`, `TYPO`, `BUILD`, `CGEN`, `PLOT`, `SPHERE`, `ADMIN`, `REQUEST`.

## Notification

When a new job is submitted, all connected staff members (admin, wizard, superuser) receive an in-game message:

```
>JOBS: New BUG job #42: "Login broken" from Alice.
```

The submitter is excluded from the notification. Each player is notified at most once per job:created event.
