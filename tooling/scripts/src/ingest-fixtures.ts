/**
 * One-off runner for P1b's `fixture-ingestion` pg-boss job
 * (`packages/jobs/workers/fixture-ingestion-worker.ts`).
 *
 * Follows the same standalone-script convention as `seed.ts`/`reset.ts` in
 * this directory (`dotenv -c -e ../../.env -- tsx ./src/<script>.ts`), but
 * exercises the real pg-boss round trip rather than calling the ingestion
 * logic directly: it starts the job provider, registers the
 * `fixture-ingestion` worker, enqueues one job, and polls until pg-boss
 * reports it `completed` (or `failed`). This is what "run the P1b job"
 * means end-to-end — a queued job a worker picks up and processes, not just
 * a bare function call.
 */

import { jobProvider, registerFixtureIngestionWorker } from "@repo/jobs";
import { logger } from "@repo/logs";

const POLL_INTERVAL_MS = 500;
const TIMEOUT_MS = 30_000;

async function main() {
	logger.info("Starting fixture-ingestion job run...");

	await jobProvider.start();
	const { queueName, workerId } =
		await registerFixtureIngestionWorker(jobProvider);

	const jobId = await jobProvider.send(queueName, {});
	if (!jobId) {
		throw new Error("Failed to enqueue fixture-ingestion job");
	}
	logger.info(
		`Enqueued fixture-ingestion job ${jobId}, waiting for completion...`,
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
			`fixture-ingestion job ${jobId} failed — check logs above`,
		);
	}
	if (finalState !== "completed") {
		throw new Error(
			`fixture-ingestion job ${jobId} did not complete within ${TIMEOUT_MS}ms`,
		);
	}

	logger.success(`fixture-ingestion job ${jobId} completed`);
}

main()
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		logger.error(error);
		process.exit(1);
	});
