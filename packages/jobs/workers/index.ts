/**
 * Worker Registration System
 *
 * To add a new worker:
 * 1. Create a new file in packages/jobs/workers/ (e.g., email-worker.ts)
 * 2. Export a function that registers the worker and returns the worker ID
 * 3. Import and add it to the workers array below
 *
 * Example worker (create queue before work so pg-boss has the queue before the worker subscribes):
 * ```typescript
 * import type { JobProvider } from "../types";
 * import { logger } from "@repo/logs";
 *
 * const EMAIL_QUEUE = "email-queue";
 *
 * export async function registerEmailWorker(
 *   jobProvider: JobProvider,
 * ): Promise<WorkerEntry> {
 *   await jobProvider.createQueue(EMAIL_QUEUE);
 *   const workerId = await jobProvider.work(EMAIL_QUEUE, async (jobs) => {
 *     for (const job of jobs) {
 *       try {
 *         // Process email job
 *         logger.info("Processing email job", { jobId: job.id });
 *         await jobProvider.complete(EMAIL_QUEUE, job.id);
 *       } catch (err) {
 *         await jobProvider.fail(EMAIL_QUEUE, job.id);
 *       }
 *     }
 *   });
 *   return { queueName: EMAIL_QUEUE, workerId };
 * }
 * ```
 */

import type { JobProvider } from "../types";
import { registerDriveIngestionWorker } from "./drive-ingestion-worker";
import { registerFixtureIngestionWorker } from "./fixture-ingestion-worker";
import { registerRateLimitedTaskWorker } from "./rate-limited-task-worker";

/**
 * Entry for a registered worker; used for graceful shutdown so offWork is called with the correct queue name.
 */
export interface WorkerEntry {
	queueName: string;
	workerId: string;
}

/**
 * Type for worker registration functions.
 * Each must return { queueName, workerId } so stop() can call offWork(queueName, { id: workerId, wait: false }).
 */
type WorkerRegistration = (jobProvider: JobProvider) => Promise<WorkerEntry>;

/**
 * Array of all worker registration functions
 * Add your workers here - they will be automatically registered and tracked
 */
const workers: WorkerRegistration[] = [
	registerRateLimitedTaskWorker,
	registerFixtureIngestionWorker,
	registerDriveIngestionWorker,
];

/**
 * Register all workers
 * This function is called automatically when the job system starts
 */
export async function registerAllWorkers(
	jobProvider: JobProvider,
): Promise<WorkerEntry[]> {
	const entries: WorkerEntry[] = [];

	for (const registerWorker of workers) {
		const entry = await registerWorker(jobProvider);
		entries.push(entry);
	}

	return entries;
}
