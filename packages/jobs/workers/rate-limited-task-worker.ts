import { acquireRateLimitSlot, getRateLimitConfig } from "@repo/database";
import { logger } from "@repo/logs";
import { getRateLimitedTaskHandler } from "../rate-limited-task-handlers";
import type { Job, JobProvider } from "../types";

export const RATE_LIMITED_TASK_QUEUE = "rate-limited-task";

export interface RateLimitedTaskJobData {
	rateLimitKey: string;
	taskType: string;
	payload: Record<string, unknown>;
}

const DEFAULT_GROUP_CONCURRENCY = 5;

export async function registerRateLimitedTaskWorker(
	jobProvider: JobProvider,
): Promise<{ queueName: string; workerId: string }> {
	await jobProvider.createQueue(RATE_LIMITED_TASK_QUEUE, {
		retryLimit: 2,
		retryBackoff: true,
	});

	const workerId = await jobProvider.work(
		RATE_LIMITED_TASK_QUEUE,
		{
			batchSize: 1,
			groupConcurrency: DEFAULT_GROUP_CONCURRENCY,
		},
		async (jobs: Job[]) => {
			for (const job of jobs) {
				const data = job.data as unknown as RateLimitedTaskJobData;
				const { rateLimitKey, taskType, payload } = data;

				if (!rateLimitKey || !taskType) {
					logger.warn(
						"Rate-limited task job missing rateLimitKey or taskType",
						{ jobId: job.id },
					);
					await jobProvider.fail(RATE_LIMITED_TASK_QUEUE, job.id);
					continue;
				}

				const handler = getRateLimitedTaskHandler(taskType);
				if (!handler) {
					logger.warn("No handler registered for task type", {
						taskType,
						jobId: job.id,
					});
					await jobProvider.fail(RATE_LIMITED_TASK_QUEUE, job.id);
					continue;
				}

				const config = await getRateLimitConfig(rateLimitKey);
				if (!config) {
					logger.warn("Rate limit config not found for key", {
						rateLimitKey,
						jobId: job.id,
					});
					await jobProvider.fail(RATE_LIMITED_TASK_QUEUE, job.id);
					continue;
				}

				try {
					await acquireRateLimitSlot(rateLimitKey);
					await handler(payload ?? {});
					await jobProvider.complete(RATE_LIMITED_TASK_QUEUE, job.id);
				} catch (err) {
					logger.error("Rate-limited task failed", {
						taskType,
						jobId: job.id,
						error: err,
					});
					await jobProvider.fail(RATE_LIMITED_TASK_QUEUE, job.id);
				}
			}
		},
	);

	return { queueName: RATE_LIMITED_TASK_QUEUE, workerId };
}

/**
 * Job options for rate-limited tasks. Use group id per rateLimitKey so concurrency is per key.
 */
export function getRateLimitedTaskJobOptions(rateLimitKey: string) {
	return {
		group: { id: `${rateLimitKey}-rate-limit` },
		retryLimit: 2,
		retryBackoff: true,
	};
}
