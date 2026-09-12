/**
 * One-off runner for P1a's `drive-ingestion` pg-boss job
 * (`packages/jobs/workers/drive-ingestion-worker.ts`).
 *
 * Same standalone-script convention as `ingest-fixtures.ts` (P1b) — starts
 * the job provider, registers the worker, enqueues one job, and polls until
 * pg-boss reports `completed`/`failed` — but this job is per-user
 * (product specification P1a), so it takes a `userId` as a required CLI argument
 * instead of running unconditionally against static fixture files:
 *
 *   pnpm --filter @repo/scripts ingest:drive <userId>
 */

import { jobProvider, registerDriveIngestionWorker } from "@repo/jobs";
import { logger } from "@repo/logs";

const POLL_INTERVAL_MS = 500;
const TIMEOUT_MS = 30_000;

async function main() {
	const userId = process.argv[2];
	if (!userId) {
		throw new Error(
			"Usage: pnpm --filter @repo/scripts ingest:drive <userId>",
		);
	}

	logger.info(`Starting drive-ingestion job run for user ${userId}...`);

	await jobProvider.start();
	const { queueName, workerId } =
		await registerDriveIngestionWorker(jobProvider);

	const jobId = await jobProvider.send(queueName, { userId });
	if (!jobId) {
		throw new Error("Failed to enqueue drive-ingestion job");
	}
	logger.info(
		`Enqueued drive-ingestion job ${jobId} for user ${userId}, waiting for completion...`,
	);

	const deadline = Date.now() + TIMEOUT_MS;
	let finalState: string | null = null;
	while (Date.now() < deadline) {
		const [job] = await jobProvider.findJobs(queueName, { id: jobId });
		if (job && (job.state === "completed" || job.state === "failed")) {
			finalState = job.state;
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}

	await jobProvider.offWork(queueName, { id: workerId, wait: false });
	await jobProvider.stop();

	if (finalState === "failed") {
		throw new Error(
			`drive-ingestion job ${jobId} failed — check logs above`,
		);
	}
	if (finalState !== "completed") {
		throw new Error(
			`drive-ingestion job ${jobId} did not complete within ${TIMEOUT_MS}ms`,
		);
	}

	logger.success(`drive-ingestion job ${jobId} completed`);
}

main()
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		logger.error(error);
		process.exit(1);
	});
