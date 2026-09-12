# Best Practices: API Endpoints vs Workers

## ✅ Recommended Pattern: Separation of Concerns

**API Endpoints** → **Enqueue Jobs** → **Workers Process Jobs**

```
┌─────────────┐         ┌──────────┐         ┌──────────┐
│ API Endpoint│  send() │  Queue   │  work() │ Workers  │
│             │────────>│          │────────>│          │
│ (Fast)      │         │ (pg-boss)│         │ (Heavy)  │
└─────────────┘         └──────────┘         └──────────┘
```

### Why This Separation?

1. **API Endpoints Should Be Fast**
   - Return quickly (< 200ms ideally)
   - Don't block HTTP requests
   - Better user experience

2. **Workers Handle Heavy Processing**
   - Can run for minutes/hours
   - Automatic retries on failure
   - Don't block HTTP requests
   - Can scale independently

3. **Better Resource Management**
   - API instances handle requests
   - Worker instances process jobs
   - Independent scaling

## Implementation Pattern

### 1. API Endpoint: Enqueue Job

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

    // Return job ID to client
    return { jobId, status: "queued" };
  });
```

### 2. Worker: Process Job

```typescript
// packages/jobs/workers/email-worker.ts
import type { JobProvider } from "../types";
import { logger } from "@repo/logs";
import { sendEmail } from "@repo/mail"; // Your email sending logic

export async function registerEmailWorker(
  jobProvider: JobProvider,
): Promise<string> {
  return await jobProvider.work("email-queue", async (jobs) => {
    for (const job of jobs) {
      try {
        const { to, subject, body, userId } = job.data as {
          to: string;
          subject: string;
          body: string;
          userId: string;
        };

        logger.info("Processing email job", { jobId: job.id, to });

        // Heavy processing happens here
        await sendEmail({
          to,
          subject,
          body,
        });

        // Mark as completed
        await jobProvider.complete("email-queue", job.id);
        logger.info("Email sent successfully", { jobId: job.id });
      } catch (error) {
        logger.error("Failed to send email", { jobId: job.id, error });
        // Mark as failed (will retry if configured)
        await jobProvider.fail("email-queue", job.id);
      }
    }
  });
}
```

## When to Use Each Approach

### Use API Endpoints For:
- ✅ **Enqueuing jobs** (always)
- ✅ **Lightweight operations** (< 1 second)
- ✅ **Synchronous operations** that must complete before response
- ✅ **Job status checks** (querying queue stats)

### Use Workers For:
- ✅ **Heavy processing** (> 1 second)
- ✅ **External API calls** (email, SMS, webhooks)
- ✅ **File processing** (images, videos, documents)
- ✅ **Database batch operations**
- ✅ **Scheduled/recurring tasks**
- ✅ **Operations that can fail and retry**

## Anti-Patterns to Avoid

### ❌ Don't: Process Jobs in API Endpoints

```typescript
// BAD: Heavy processing in API endpoint
export const sendEmail = protectedProcedure
  .handler(async ({ input }) => {
    // This blocks the HTTP request!
    await sendEmailHeavyProcessing(input); // Takes 5 seconds
    return { success: true };
  });
```

**Problems:**
- HTTP request times out
- Poor user experience
- Can't retry on failure
- Blocks server resources

### ❌ Don't: Put Business Logic in Workers

```typescript
// BAD: Business logic mixed with worker registration
export async function registerEmailWorker(jobProvider: JobProvider) {
  return await jobProvider.work("email-queue", async (jobs) => {
    // Business logic should be in a separate module
    const emailService = new EmailService();
    // ... complex business logic here
  });
}
```

**Better:**
```typescript
// GOOD: Business logic in separate module
import { emailService } from "@repo/mail/services/email-service";

export async function registerEmailWorker(jobProvider: JobProvider) {
  return await jobProvider.work("email-queue", async (jobs) => {
    for (const job of jobs) {
      await emailService.send(job.data);
    }
  });
}
```

## Recommended File Structure

```
packages/
├── api/
│   └── modules/
│       └── email/
│           └── procedures/
│               └── send-email.ts          # Enqueue job
│
├── jobs/
│   └── workers/
│       └── email-worker.ts                # Process job
│
└── mail/
    └── services/
        └── email-service.ts               # Business logic
```

## Example: Complete Email Flow

### 1. API Endpoint (Enqueue)

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
    // Validate input (lightweight)
    // Enqueue job (fast)
    const jobId = await jobProvider.send("email-queue", {
      ...input,
      userId: context.user.id,
      createdAt: new Date().toISOString(),
    });

    return { jobId, status: "queued" };
  });
```

### 2. Worker (Process)

```typescript
// packages/jobs/workers/email-worker.ts
import type { JobProvider } from "../types";
import { logger } from "@repo/logs";
import { emailService } from "@repo/mail/services/email-service";

export async function registerEmailWorker(
  jobProvider: JobProvider,
): Promise<string> {
  return await jobProvider.work("email-queue", async (jobs) => {
    for (const job of jobs) {
      try {
        await emailService.send(job.data);
        await jobProvider.complete("email-queue", job.id);
      } catch (error) {
        logger.error("Email job failed", { jobId: job.id, error });
        await jobProvider.fail("email-queue", job.id);
      }
    }
  });
}
```

### 3. Business Logic (Reusable)

```typescript
// packages/mail/services/email-service.ts
import { sendEmail } from "@repo/mail";

export const emailService = {
  async send(data: EmailJobData) {
    // Business logic here
    // Can be reused by workers, API endpoints, or other services
    return await sendEmail({
      to: data.to,
      subject: data.subject,
      body: data.body,
    });
  },
};
```

## Summary

**Keep job processing logic in workers, not API endpoints.**

- ✅ API endpoints: Enqueue jobs (fast, non-blocking)
- ✅ Workers: Process jobs (heavy, async, retryable)
- ✅ Business logic: Separate modules (reusable)

This separation provides:
- Better performance
- Better scalability
- Better error handling
- Better user experience
- Cleaner code organization

