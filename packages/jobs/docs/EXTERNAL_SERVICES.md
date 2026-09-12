# External Service Integration Pattern

## Overview

When integrating with external services that process tasks asynchronously (e.g., data processing, AI services, file conversion), you need to handle:
1. **Submitting tasks** to the external service
2. **Receiving completion callbacks** (webhooks)
3. **Polling for status** (if webhooks aren't available)
4. **Finishing work** after external processing completes

## Recommended Architecture

```
┌─────────────┐    ┌──────────────┐         ┌──────────┐    ┌──────────┐
│ API Endpoint│───>│ External     │         │ Webhook  │───>│ Finishing│
│ (Submit)    │    │ Service      │         │ Endpoint │    │ Worker   │
└─────────────┘    └──────────────┘         └──────────┘    └──────────┘
                           │                                    │
                           │                                    │
                    ┌──────▼──────┐                     ┌───────┴──────┐
                    │ Poll Worker │                     │ Finishing    │
                    │ (if needed) │────────────────────>│ Job Queue    │
                    └─────────────┘                     └──────────────┘
```

## Implementation Pattern

### 1. Submit Task to External Service (API Endpoint)

```typescript
// packages/api/modules/data-processing/procedures/start-processing.ts
import { protectedProcedure } from "../../../orpc/procedures";
import { jobProvider } from "@repo/jobs";
import { z } from "zod";

export const startProcessing = protectedProcedure
  .route({
    method: "POST",
    path: "/data-processing/start",
    tags: ["DataProcessing"],
  })
  .input(z.object({
    data: z.string(),
    options: z.object({}).optional(),
  }))
  .handler(async ({ input, context }) => {
    // Submit to external service
    const externalTaskId = await submitToExternalService(input.data);

    // Store task mapping in database
    const taskId = await createTaskRecord({
      userId: context.user.id,
      externalTaskId,
      status: "processing",
    });

    // If no webhook available, start polling job
    if (!externalService.hasWebhook) {
      await jobProvider.sendAfter(
        "data-processing-poll",
        {
          taskId,
          externalTaskId,
        },
        undefined,
        Date.now() + 30 * 60 * 1000, // Poll after 30 minutes
      );
    }

    return { taskId, status: "processing" };
  });
```

### 2. Webhook Endpoint (API Layer - Fast)

```typescript
// packages/api/modules/data-processing/procedures/webhook-callback.ts
import { publicProcedure } from "../../../orpc/procedures";
import { jobProvider } from "@repo/jobs";
import { z } from "zod";

export const webhookCallback = publicProcedure
  .route({
    method: "POST",
    path: "/data-processing/webhook",
    tags: ["DataProcessing"],
  })
  .input(z.object({
    taskId: z.string(),
    status: z.enum(["completed", "failed"]),
    resultUrl: z.string().optional(),
    error: z.string().optional(),
    signature: z.string().optional(), // For webhook verification
  }))
  .handler(async ({ input }) => {
    // Verify webhook signature (important for security)
    if (!verifyWebhookSignature(input.signature, input)) {
      throw new Error("Invalid webhook signature");
    }

    // Enqueue finishing job - returns immediately (< 50ms)
    // Use singletonKey to prevent duplicate jobs if webhook is called multiple times
    await jobProvider.send(
      "data-processing-finish",
      {
        taskId: input.taskId,
        status: input.status,
        resultUrl: input.resultUrl,
        error: input.error,
      },
      {
        singletonKey: `finish-${input.taskId}`, // Prevent duplicates
        singletonSeconds: 3600, // 1 hour window
      }
    );

    return { received: true }; // Fast response
  });
```

### 3. Polling Worker (If No Webhook)

```typescript
// packages/jobs/workers/data-processing-poll-worker.ts
import type { JobProvider } from "../types";
import { logger } from "@repo/logs";

export async function registerDataProcessingPollWorker(
  jobProvider: JobProvider,
): Promise<string> {
  return await jobProvider.work("data-processing-poll", async (jobs) => {
    for (const job of jobs) {
      try {
        const { taskId, externalTaskId } = job.data as {
          taskId: string;
          externalTaskId: string;
        };

        logger.info("Polling external service", { taskId, externalTaskId });

        // Check external service status
        const status = await checkExternalServiceStatus(externalTaskId);

        if (status === "completed" || status === "failed") {
          // Enqueue finishing job (same as webhook would)
          // Use singletonKey to prevent duplicates if polling runs multiple times
          await jobProvider.send(
            "data-processing-finish",
            {
              taskId,
              status,
              resultUrl: status === "completed" 
                ? await getResultUrl(externalTaskId) 
                : undefined,
              error: status === "failed" ? "Processing failed" : undefined,
            },
            {
              singletonKey: `finish-${taskId}`, // Prevent duplicates
              singletonSeconds: 3600, // 1 hour window
            }
          );

          // Mark poll job as complete
          await jobProvider.complete("data-processing-poll", job.id);
        } else if (status === "processing") {
          // Still processing - reschedule check
          await jobProvider.sendAfter(
            "data-processing-poll",
            { taskId, externalTaskId },
            undefined,
            Date.now() + 5 * 60 * 1000, // Check again in 5 minutes
          );
          await jobProvider.complete("data-processing-poll", job.id);
        }
      } catch (error) {
        logger.error("Polling failed", { jobId: job.id, error });
        await jobProvider.fail("data-processing-poll", job.id);
      }
    }
  });
}
```

### 4. Finishing Worker (Process Completion)

```typescript
// packages/jobs/workers/data-processing-finish-worker.ts
import type { JobProvider } from "../types";
import { logger } from "@repo/logs";
import { dataProcessingService } from "@repo/services/data-processing-service";

export async function registerDataProcessingFinishWorker(
  jobProvider: JobProvider,
): Promise<string> {
  return await jobProvider.work("data-processing-finish", async (jobs) => {
    for (const job of jobs) {
      try {
        const { taskId, status, resultUrl, error } = job.data as {
          taskId: string;
          status: "completed" | "failed";
          resultUrl?: string;
          error?: string;
        };

        if (status === "completed") {
          // Download result, update database, send notifications, etc.
          await dataProcessingService.handleCompletedTask(taskId, resultUrl);
          logger.info("Task completed successfully", { taskId });
        } else {
          // Handle failure: notify user, cleanup, etc.
          await dataProcessingService.handleFailedTask(taskId, error);
          logger.info("Task failed", { taskId, error });
        }

        await jobProvider.complete("data-processing-finish", job.id);
      } catch (error) {
        logger.error("Failed to finish data processing", { 
          jobId: job.id, 
          error 
        });
        await jobProvider.fail("data-processing-finish", job.id);
      }
    }
  });
}
```

## When to Use Webhooks vs Polling

**Use Webhooks When:**
- ✅ External service supports webhooks
- ✅ You need immediate notification of completion
- ✅ You want to minimize API calls to external service
- ✅ You can secure the webhook endpoint

**Use Polling When:**
- ✅ External service doesn't support webhooks
- ✅ Timing isn't critical (can wait for traffic)
- ✅ You want to avoid maintaining webhook infrastructure
- ✅ Using Option 1 deployment (workers scale with traffic)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for details on deployment options.

## Important Considerations

### 1. Webhook Security

Always verify webhook signatures:

```typescript
function verifyWebhookSignature(signature: string, payload: unknown): boolean {
  const expectedSignature = createHmac("sha256", WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest("hex");
  return signature === expectedSignature;
}
```

### 2. Polling with Option 1 (Scale to 0)

**Important:** With Option 1 deployment, `sendAfter` jobs may not run at exact scheduled times:

- Instance stays warm for ~15 minutes after last request
- If scheduled time falls within warm period → job runs on time ✅
- If scheduled time is after instance scales to 0 → job waits until next traffic ⏳

**This is acceptable if:**
- Timing doesn't need to be exact
- You've evaluated your traffic patterns
- Jobs can wait until traffic arrives

**For exact timing, use:**
- Option 2 or 3 (always-on workers) - see [DEPLOYMENT.md](./DEPLOYMENT.md)
- Cloud Scheduler to trigger polling via API

### 3. Idempotency

Handle idempotency at **two levels**:

**Level 1: Prevent Duplicate Jobs (Jobs Module)**

Use `singletonKey` to prevent duplicate jobs from being queued:

```typescript
// Webhook endpoint - prevent duplicate finishing jobs
await jobProvider.send(
  "data-processing-finish",
  {
    taskId: input.taskId,
    status: input.status,
    resultUrl: input.resultUrl,
  },
  {
    singletonKey: `finish-${input.taskId}`, // Unique per task
    singletonSeconds: 3600, // Prevent duplicates for 1 hour
  }
);

// Polling worker - prevent duplicate finishing jobs
await jobProvider.send(
  "data-processing-finish",
  { taskId, status, resultUrl },
  {
    singletonKey: `finish-${taskId}`,
    singletonSeconds: 3600,
  }
);
```

**How `singletonKey` works:**
- If a job with the same `singletonKey` already exists in the queue → new job is ignored
- Prevents duplicate jobs from being queued (e.g., webhook called multiple times)
- `singletonSeconds` defines the time window for uniqueness

**Level 2: Idempotent Business Logic (Application Level)**

Even with `singletonKey`, handle idempotency in your business logic (defense in depth):

```typescript
async function handleCompletedTask(taskId: string, resultUrl?: string) {
  // Check if already processed (idempotency check)
  const task = await getTask(taskId);
  if (task.status === "completed") {
    logger.info("Task already completed, skipping", { taskId });
    return; // Already processed, skip
  }

  // Use database transaction to ensure atomicity
  await db.transaction(async (tx) => {
    // Double-check status within transaction
    const currentTask = await tx.task.findUnique({ where: { id: taskId } });
    if (currentTask?.status === "completed") {
      return; // Another worker already processed it
    }

    // Process only if not already done
    await tx.task.update({
      where: { id: taskId },
      data: { status: "completed" },
    });

    await downloadAndStoreResult(taskId, resultUrl);
    await sendNotification(taskId);
  });
}
```

**Why Both Levels?**

1. **`singletonKey` (Level 1):**
   - Prevents duplicate jobs from being queued
   - Reduces unnecessary work
   - Works even if webhook is called multiple times

2. **Business Logic Idempotency (Level 2):**
   - Handles edge cases (job retries, race conditions)
   - Ensures data consistency
   - Defense in depth approach

**Best Practice:** Always use both levels for critical operations.

## Complete Flow Example

**Scenario:** External data processing service (30 min processing time)

1. **User submits task** → API endpoint enqueues to external service
2. **If webhook available:**
   - External service calls webhook when done
   - Webhook endpoint enqueues finishing job
   - Finishing worker processes result
3. **If no webhook:**
   - Polling job scheduled for 30 minutes later
   - When traffic arrives → poll worker checks status
   - If done → enqueues finishing job
   - If still processing → reschedules poll
   - Finishing worker processes result

## File Structure

```
packages/
├── api/
│   └── modules/
│       └── data-processing/
│           └── procedures/
│               ├── start-processing.ts    # Submit to external service
│               └── webhook-callback.ts     # Receive webhook
│
├── jobs/
│   └── workers/
│       ├── data-processing-poll-worker.ts    # Poll external service
│       └── data-processing-finish-worker.ts  # Handle completion
│
└── services/
    └── data-processing-service.ts           # Business logic
```

## Best Practices

1. **Always use jobs for finishing work** - Never do heavy processing in webhook endpoint
2. **Verify webhook signatures** - Security is critical
3. **Make finishing work idempotent** - Safe to retry
4. **Handle both success and failure** - External services can fail
5. **Log everything** - Debugging async flows is hard
6. **Consider timeout limits** - Set max retries/polling attempts
7. **Use appropriate deployment option** - Option 1 for flexible timing, Option 2/3 for exact timing (see [DEPLOYMENT.md](./DEPLOYMENT.md))

