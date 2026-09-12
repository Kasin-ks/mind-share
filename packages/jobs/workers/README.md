# Job Workers

This directory contains all job worker implementations. Workers are automatically registered when the job system initializes.

## Adding a New Worker

1. Create a new file in this directory (e.g., `email-worker.ts`)

2. Export a function that registers the worker:

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
        // Your job processing logic here
        logger.info("Processing email job", { 
          jobId: job.id, 
          data: job.data 
        });
        
        // Mark job as completed
        await jobProvider.complete("email-queue", job.id);
      } catch (error) {
        logger.error("Failed to process email job", { 
          jobId: job.id, 
          error 
        });
        // Mark job as failed (will retry if configured)
        await jobProvider.fail("email-queue", job.id);
      }
    }
  });
}
```

3. Import and add it to the workers array in `packages/jobs/workers/index.ts`:

```typescript
import { registerEmailWorker } from "./email-worker";

const workers: WorkerRegistration[] = [
  registerEmailWorker,
  // Add more workers here
];
```

That's it! The worker will be automatically registered and tracked for graceful shutdown.

## Worker Best Practices

1. **Error Handling**: Always wrap job processing in try-catch and handle errors appropriately
2. **Logging**: Log important events (start, completion, errors)
3. **Job Completion**: Explicitly mark jobs as completed or failed
4. **Idempotency**: Design workers to be idempotent (safe to retry)
5. **Resource Cleanup**: Clean up any resources (DB connections, file handles, etc.)

## Worker Options

You can configure worker behavior using the `work` method's options parameter:

```typescript
await jobProvider.work(
  "queue-name",
  {
    batchSize: 10,        // Process up to 10 jobs at once
    teamSize: 2,          // Number of concurrent workers
    teamConcurrency: 5,    // Max concurrent jobs per worker
  },
  async (jobs) => {
    // Process jobs
  }
);
```

See `packages/jobs/types.ts` for full `WorkerOptions` interface.

