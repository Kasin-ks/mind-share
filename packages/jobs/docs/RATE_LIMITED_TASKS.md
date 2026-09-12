# Rate-limited tasks

The job system provides a **generic rate-limited task** queue: you enqueue a task with a `rateLimitKey` and `taskType`; the worker acquires a slot for that key (rolling window) and runs the handler registered for that task type.

**Config and handlers** live in `packages/jobs/rate-limited/` and run automatically on startup:

- **`configs.ts`** — list of rate-limit keys and their limits. `ensureRateLimitConfigs()` writes them to the DB.
- **`handlers.ts`** — `registerRateLimitedHandlers()` registers one handler per task type.
- **`index.ts`** — `bootstrapRateLimited()` runs both; called from job server `initialize()`.

---

## Use case 1: 10 rpm external API

Limit outgoing calls to an external API to **10 requests per minute**.

### 1. Config

In `packages/jobs/rate-limited/configs.ts`, ensure there is an entry for your key (already present by default):

```ts
{ key: "external-api", windowSeconds: 60, maxSlots: 10, retentionMinutes: 5 }
```

`ensureRateLimitConfigs()` runs on startup, so the DB will have this config.

### 2. Handler

The handler **`call-external-api`** is registered in `packages/jobs/rate-limited/handlers.ts`. It does:

- Read `payload.url`, optional `method`, `body`, `headers`.
- `fetch(url, ...)`.
- Throw on 429 or non-ok so the job fails and retries.

You can change that handler in `handlers.ts` (e.g. add auth headers, different error handling).

### 3. Enqueue

From the client (oRPC):

```ts
const { jobId } = await orpcClient.tasks.enqueueRateLimited({
  rateLimitKey: "external-api",
  taskType: "call-external-api",
  payload: {
    url: "https://api.example.com/v1/action",
    method: "POST",
    body: { foo: "bar" },
  },
});
```

From server code:

```ts
import { jobProvider, sendRateLimitedTask } from "@repo/jobs";

await sendRateLimitedTask(jobProvider, {
  rateLimitKey: "external-api",
  taskType: "call-external-api",
  payload: {
    url: "https://api.example.com/v1/action",
    method: "POST",
    body: { foo: "bar" },
  },
});
```

The worker will acquire a slot for `external-api` (max 10 per 60s) then run the fetch. On 429 the job fails and pg-boss retries later.

---

## Use case 2: 60 rpm in-app function

Limit how often a **function inside your app** runs to **60 times per minute** (e.g. heavy report generation).

### 1. Config

In `packages/jobs/rate-limited/configs.ts` there is already an entry:

```ts
{ key: "report-generation", windowSeconds: 60, maxSlots: 60, retentionMinutes: 5 }
```

Add or edit entries there to track all keys; they are applied on startup.

### 2. Handler

In `packages/jobs/rate-limited/handlers.ts`, the **`report-generation`** handler is a placeholder that logs the payload. Replace it with your actual logic (or call your app module):

```ts
registerRateLimitedTaskHandler("report-generation", async (payload) => {
  // Replace with your function, e.g.:
  await generateReport(payload as { reportId: string; userId: string });
});
```

Ensure the function is imported and called inside the handler so business logic stays in one place.

### 3. Trigger by enqueueing (not calling the function directly)

From an API route or procedure: do **auth + validation**, then enqueue instead of calling the function:

```ts
// Before: await generateReport(reportId, userId);
// After:
const jobId = await sendRateLimitedTask(jobProvider, {
  rateLimitKey: "report-generation",
  taskType: "report-generation",
  payload: { reportId, userId },
});
return { jobId };
```

From the client:

```ts
const { jobId } = await orpcClient.tasks.enqueueRateLimited({
  rateLimitKey: "report-generation",
  taskType: "report-generation",
  payload: { reportId: "rpt-123", userId: "user-456" },
});
```

The worker acquires a slot (up to 60 per minute) and runs your handler. Return `jobId` so the client can poll status if needed (`jobProvider.findJobs("rate-limited-task", { id: jobId })`).

---

## Adding a new rate-limited task

1. **Config** — In `rate-limited/configs.ts`, add an entry to `RATE_LIMIT_CONFIGS` with a unique `key`, and set `windowSeconds`, `maxSlots`, `retentionMinutes`.
2. **Handler** — In `rate-limited/handlers.ts`, call `registerRateLimitedTaskHandler("your-task-type", async (payload) => { ... })` with your logic.
3. **Enqueue** — Use `tasks.enqueueRateLimited` or `sendRateLimitedTask` with the same `rateLimitKey` and `taskType`, and the payload your handler expects.

Configs and handlers run automatically on job system startup via `bootstrapRateLimited()`.
