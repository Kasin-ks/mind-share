# Job Queue System

A robust, PostgreSQL-based job queue system using pg-boss for background job processing.

## Overview

The `@repo/jobs` package provides a type-safe job queue system that allows you to:
- Enqueue jobs from API endpoints (fast, non-blocking)
- Process jobs in background workers (heavy, async, retryable)
- Handle graceful shutdown and resource cleanup
- Scale workers independently based on deployment strategy

## Quick Start

### 1. Enqueue a Job (API Endpoint)

```typescript
// packages/api/modules/email/procedures/send-email.ts
import { protectedProcedure } from "../../../orpc/procedures";
import { jobProvider } from "@repo/jobs";
import { z } from "zod";

export const sendEmail = protectedProcedure
  .route({
    method: "POST",
    path: "/email/send",
    tags: ["Email"],
  })
  .input(z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }))
  .handler(async ({ input, context }) => {
    // Enqueue the job - returns immediately
    const jobId = await jobProvider.send("email-queue", {
      to: input.to,
      subject: input.subject,
      body: input.body,
      userId: context.user.id,
    });

    return { jobId, status: "queued" };
  });
```

### 2. Create a Worker

```typescript
// packages/jobs/workers/email-worker.ts
import type { JobProvider } from "../types";
import { logger } from "@repo/logs";

export async function registerEmailWorker(
  jobProvider: JobProvider,
): Promise<string> {
  return await jobProvider.work("email-queue", async (jobs) => {
    for (const job of jobs) {
      try {
        // Process job here
        await sendEmail(job.data);
        await jobProvider.complete("email-queue", job.id);
      } catch (error) {
        logger.error("Failed to process email job", { jobId: job.id, error });
        await jobProvider.fail("email-queue", job.id);
      }
    }
  });
}
```

### 3. Register the Worker

Add to `packages/jobs/workers/index.ts`:

```typescript
import { registerEmailWorker } from "./email-worker";

const workers: WorkerRegistration[] = [
  registerEmailWorker,
  // Add more workers here
];
```

That's it! Workers are automatically registered when the job system initializes.

## Documentation

- **[Best Practices](./docs/BEST_PRACTICES.md)** - When to use API endpoints vs workers, anti-patterns, file structure
- **[Adding Workers](./workers/README.md)** - Step-by-step guide for creating new workers
- **[Deployment Options](./docs/DEPLOYMENT.md)** - Cloud Run deployment strategies and configuration
- **[External Services](./docs/EXTERNAL_SERVICES.md)** - Patterns for webhooks, polling, and async external integrations

## Key Concepts

### Separation of Concerns

**API Endpoints** → **Enqueue Jobs** → **Workers Process Jobs**

- API endpoints should be fast (< 200ms) and non-blocking
- Workers handle heavy processing that can take minutes/hours
- Business logic lives in separate service modules (reusable)

### Job Lifecycle

1. **Enqueue**: API endpoint calls `jobProvider.send(queueName, data)`
2. **Process**: Worker picks up job via `jobProvider.work(queueName, handler)`
3. **Complete/Fail**: Worker calls `jobProvider.complete()` or `jobProvider.fail()`

### Initialization

The job system is initialized in `apps/web/instrumentation.ts`:

```typescript
import {
  initialize as initializeJobs,
  setupGracefulShutdown,
} from "@repo/jobs";

export async function register() {
  await initializeJobs();
  setupGracefulShutdown();
}
```

## Configuration

Set in `config/index.ts`:

```typescript
jobs: {
  enabled: true,
  schema: "pgboss", // Optional, defaults to "pgboss"
  applicationName: "pg-boss-worker", // Optional
}
```

## Environment Variables

- `DATABASE_URL` - Required for pg-boss connection
- `PGBOSS_SCHEMA` - Optional, defaults to "pgboss"
- `PGBOSS_APPLICATION_NAME` - Optional, defaults to "pg-boss-worker"
- `PGBOSS_INCLUDE_METRICS` - Optional, set to "true" to enable metrics

## API Reference

### JobProvider Methods

```typescript
// Send a job to a queue
await jobProvider.send(queueName, data, options?);

// Send a job to run after a delay
await jobProvider.sendAfter(queueName, data, options?, startAfter);

// Process jobs from a queue
await jobProvider.work(queueName, handler, options?);

// Mark job as completed
await jobProvider.complete(queueName, jobId);

// Mark job as failed
await jobProvider.fail(queueName, jobId);

// Get queue statistics
await jobProvider.getQueueStats(queueName);
```

See `packages/jobs/types.ts` for full type definitions.

## Examples

- **Simple Email Worker**: See `workers/README.md`
- **External Service Integration**: See `docs/EXTERNAL_SERVICES.md`
- **Deployment Strategies**: See `docs/DEPLOYMENT.md`

## Troubleshooting

See the [Troubleshooting section](./docs/DEPLOYMENT.md#troubleshooting) in DEPLOYMENT.md for common issues and solutions.

