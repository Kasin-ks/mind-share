# Job Queue Deployment Options

This document outlines different deployment strategies for running background job workers with pg-boss in a Google Cloud Run environment.

## Overview

The `@repo/jobs` package provides a job queue system using pg-boss (PostgreSQL-based job queue). When deploying to Google Cloud Run, you need to decide how to run the job workers that process queued jobs.

**Related Documentation:**
- See [../README.md](../README.md) for overview and quick start
- See [BEST_PRACTICES.md](./BEST_PRACTICES.md) for best practices on API endpoints vs workers
- See [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md) for webhook and polling patterns
- See [../workers/README.md](../workers/README.md) for how to add new workers

## Understanding Cloud Run Auto-Scaling

### When Instances Scale to 0
- No incoming HTTP requests for a period (default ~15 minutes)
- All instances are idle
- Cloud Run scales down to 0 to save costs

### When Instances Spin Up
- When a user accesses the public URL, Cloud Run:
  1. Spins up a new instance (cold start)
  2. Starts your Next.js app
  3. Handles the request
  4. Keeps the instance warm for a period after traffic stops

### Graceful Shutdown
- Cloud Run sends a SIGTERM signal when scaling down
- Your application has time to finish requests and clean up
- You should handle this signal to stop workers gracefully

## Deployment Options

### Option 1: Workers in Same Cloud Run Service (Current Implementation)

**Description:** Run job workers in the same Cloud Run Service as your Next.js web application.

**Implementation:**
- Workers are registered in `packages/jobs/workers/index.ts`
- Job system is initialized in `apps/web/instrumentation.ts`
- Workers start when the Next.js app starts
- Workers stop gracefully on SIGTERM

**Pros:**
- Simple setup, no additional deployment needed
- Workers share the same environment variables and configuration
- Lower operational complexity

**Cons:**
- Workers compete for resources with web requests
- When scaled to 0, no workers are available (jobs wait until traffic arrives)
- Cold starts affect both web requests and job processing
- Not ideal for high-volume job processing

**Use Case:**
- Low to medium job volume
- Jobs can wait until traffic arrives
- Cost optimization is a priority
- Simple deployment is preferred

**Configuration:**

1. Register workers in `packages/jobs/workers/index.ts`:
```typescript
// packages/jobs/workers/index.ts
import type { JobProvider } from "../types";
import { registerEmailWorker } from "./email-worker";

const workers: WorkerRegistration[] = [
  registerEmailWorker,
  // Add more workers here
];

export async function registerAllWorkers(
  jobProvider: JobProvider,
): Promise<string[]> {
  const workerIds: string[] = [];
  for (const registerWorker of workers) {
    const workerId = await registerWorker(jobProvider);
    workerIds.push(workerId);
  }
  return workerIds;
}
```

2. Initialize in `apps/web/instrumentation.ts`:
```typescript
// apps/web/instrumentation.ts
import {
  initialize as initializeJobs,
  setupGracefulShutdown,
} from "@repo/jobs";
import { initialize } from "@repo/monitoring/server";

export async function register() {
  initialize();

  // Initialize job system (starts provider and registers all workers)
  await initializeJobs();

  // Setup graceful shutdown handlers for jobs
  setupGracefulShutdown();
}
```

---

### Option 2: Separate Cloud Run Job

**Description:** Deploy a separate Cloud Run Job that runs continuously to process jobs.

**Implementation:**
- Create a dedicated worker entry point (`apps/web/worker.ts`)
- Deploy as a Cloud Run Job (not Service)
- Job runs continuously and processes queued jobs

**Pros:**
- Dedicated resources for job processing
- Can run continuously (doesn't scale to 0)
- Independent scaling from web service
- Better for high-volume job processing

**Cons:**
- More complex deployment (two separate services)
- Higher cost (always running)
- Requires separate configuration management

**Use Case:**
- High job volume
- Jobs need to be processed immediately
- Real-time job processing is critical
- Can afford dedicated worker resources

**Implementation Steps:**

1. Create worker entry point:
```typescript
// apps/web/worker.ts
import {
  initialize as initializeJobs,
  setupGracefulShutdown,
} from "@repo/jobs";
import { logger } from "@repo/logs";

async function startWorker() {
  try {
    // Initialize job system (automatically registers all workers)
    await initializeJobs();
    logger.info("Job system initialized");

    // Setup graceful shutdown
    setupGracefulShutdown();

    // Keep process alive
    // Workers are already running from initializeJobs()
  } catch (error) {
    logger.error("Failed to start worker", error);
    process.exit(1);
  }
}

startWorker();
```

**Note:** Workers are automatically registered from `packages/jobs/workers/index.ts` - no need to manually register them here.

2. Update `deploy.sh` to deploy Cloud Run Job:
```bash
# After deploying the web service
echo "❇️ Deploying Cloud Run Job for background workers..."

gcloud run jobs create ${SERVICE_NAME}-worker \
  --image $IMAGE_URI \
  --region $REGION \
  --cpu $CPU \
  --memory $MEMORY \
  --max-retries 3 \
  --task-timeout 3600 \
  --set-env-vars "$ENV_VARS" \
  --command node \
  --args "apps/web/worker.js"

# Execute the job (runs continuously)
gcloud run jobs execute ${SERVICE_NAME}-worker \
  --region $REGION
```

3. Update `Dockerfile` if needed to include worker script in standalone build.

---

### Option 3: Hybrid Approach (Two Cloud Run Services)

**Description:** Deploy two separate Cloud Run Services - one for web traffic, one for workers.

**Implementation:**
- Web service: `ENABLE_WORKERS=false` (scales to 0)
- Worker service: `ENABLE_WORKERS=true`, `MIN_INSTANCES=1` (always running)

**Pros:**
- Workers always available (MIN_INSTANCES=1)
- Independent scaling for web and workers
- Can scale workers independently based on queue depth
- Better resource isolation

**Cons:**
- More complex deployment
- Higher cost (at least 1 worker instance always running)
- Two services to manage and monitor

**Use Case:**
- Need workers always available
- Want independent scaling
- Medium to high job volume
- Can afford minimum 1 worker instance

**Implementation Steps:**

1. Update `instrumentation.ts`:
```typescript
import {
  initialize as initializeJobs,
  setupGracefulShutdown,
} from "@repo/jobs";
import { initialize } from "@repo/monitoring/server";

export async function register() {
  initialize();

  // Only initialize jobs if workers are enabled
  if (process.env.ENABLE_WORKERS === "true") {
    await initializeJobs();
    setupGracefulShutdown();
  }
}
```

**Note:** The `initializeJobs()` function already checks `config.jobs.enabled`, so you only need to check the `ENABLE_WORKERS` environment variable.

2. Update `deploy.sh` to deploy two services:
```bash
# Deploy web service (no workers)
gcloud run deploy ${SERVICE_NAME} \
  --image $IMAGE_URI \
  --set-env-vars "$ENV_VARS,ENABLE_WORKERS=false" \
  --min-instances 0 \
  --max-instances $MAX_INSTANCES

# Deploy worker service (with workers)
gcloud run deploy ${SERVICE_NAME}-worker \
  --image $IMAGE_URI \
  --set-env-vars "$ENV_VARS,ENABLE_WORKERS=true" \
  --min-instances 1 \
  --max-instances 2 \
  --cpu $CPU \
  --memory $MEMORY
```

---

## Comparison Table

| Feature | Option 1 (Same Service) | Option 2 (Cloud Run Job) | Option 3 (Two Services) |
|---------|-------------------------|-------------------------|-------------------------|
| **Complexity** | Low | Medium | Medium |
| **Cost** | Low (scales to 0) | Medium (always running) | Medium (min 1 instance) |
| **Worker Availability** | Only when traffic exists | Always available | Always available |
| **Resource Isolation** | Shared | Dedicated | Dedicated |
| **Scaling** | Tied to web traffic | Fixed/Manual | Independent |
| **Cold Start Impact** | Affects both | N/A | Separate |
| **Best For** | Low-medium volume | High volume | Medium-high volume |

## Recommendations

### Choose Option 1 if:
- ✅ Jobs can wait until traffic arrives
- ✅ Low to medium job volume
- ✅ Cost optimization is priority
- ✅ Simple deployment preferred

### Choose Option 2 if:
- ✅ High job volume
- ✅ Real-time job processing critical
- ✅ Jobs must be processed immediately
- ✅ Can afford dedicated resources

### Choose Option 3 if:
- ✅ Need workers always available
- ✅ Want independent scaling
- ✅ Medium to high job volume
- ✅ Can afford minimum 1 worker instance

## Current Implementation

**Status:** Option 1 is currently implemented.

**Architecture:**
- Workers are registered in `packages/jobs/workers/index.ts` (declarative array pattern)
- Job system is initialized in `apps/web/instrumentation.ts` via `initializeJobs()`
- All worker logic is contained in the `@repo/jobs` package
- No need to modify `instrumentation.ts` when adding new workers

**Behavior:**
- Workers start when the Next.js app starts (if `config.jobs.enabled === true`)
- Process jobs when instances are running
- **Fast shutdown** on SIGTERM signal (completes within Cloud Run's ~10s grace period)
  - Uses `wait: false` to stop workers immediately
  - pg-boss automatically retries interrupted jobs
  - Prevents SIGKILL forceful termination
- Wait for traffic if scaled to 0

**HMR (development only):** The job system registers a `module.hot.dispose` callback so that when the server module is hot-reloaded in local dev (`pnpm dev`), workers and the pg-boss connection are stopped before the new module loads. In production and in all three deployment options below, `module.hot` is not present, so this is a no-op; shutdown is always handled by `setupGracefulShutdown()` (SIGTERM/SIGINT). No deployment option is affected by the HMR code.

**Cloud Run Limitations:**
- SIGTERM → SIGKILL grace period: **~10 seconds (NOT configurable)**
- Workers must stop quickly to avoid forceful termination
- Current implementation uses fast shutdown to guarantee completion
- Interrupted jobs are automatically retried by pg-boss

**Adding New Workers:**
1. Create worker file in `packages/jobs/workers/` (e.g., `email-worker.ts`)
2. Add registration function to `packages/jobs/workers/index.ts` workers array
3. No changes needed to `instrumentation.ts`

## Environment Variables

- `DATABASE_URL` - Required for pg-boss connection
- `PGBOSS_SCHEMA` - Optional, defaults to "pgboss"
- `PGBOSS_APPLICATION_NAME` - Optional, defaults to "pg-boss-worker"
- `PGBOSS_INCLUDE_METRICS` - Optional, set to "true" to enable metrics

## Monitoring

Monitor job processing through:
- pg-boss database tables (check queue status)
- Application logs (worker start/stop events)
- Cloud Run metrics (instance count, request count)
- Custom metrics if `PGBOSS_INCLUDE_METRICS=true`

## Troubleshooting

### Workers not starting
- Check `config.jobs.enabled` is `true`
- Verify `DATABASE_URL` is set correctly
- Check application logs for errors

### Jobs not being processed
- Verify workers are registered in `packages/jobs/workers/index.ts`
- Check if instances are running (not scaled to 0)
- Verify queue names match between send and work calls
- Check database connection
- Ensure `config.jobs.enabled === true`

### Graceful shutdown issues
- Ensure `setupGracefulShutdown()` is called in `instrumentation.ts`
- Verify `initializeJobs()` was called successfully
- Check that worker IDs are being tracked (automatic via `registerAllWorkers()`)
- Review logs for shutdown errors

