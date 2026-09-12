export { jobProvider } from "./provider";
export type { RateLimitConfigEntry } from "./rate-limited";
export {
	bootstrapRateLimited,
	ensureRateLimitConfigs,
	RATE_LIMIT_CONFIGS,
	registerRateLimitedHandlers,
} from "./rate-limited";
export {
	getRateLimitedTaskHandler,
	registerRateLimitedTaskHandler,
} from "./rate-limited-task-handlers";
export * from "./server";
export * from "./types";
export {
	getIngestedSourceIds,
	type IngestSourceDocumentsResult,
	ingestSourceDocuments,
	resolveIngestOwner,
} from "./lib/ingest-source-documents";
export {
	type SourceDocument,
	type SourceSystem,
	toRawExcerpt,
} from "./lib/source-document";
export {
	DRIVE_INGESTION_QUEUE,
	type DriveIngestionJobData,
	type IngestDriveFilesResult,
	ingestDriveFiles,
	registerDriveIngestionWorker,
} from "./workers/drive-ingestion-worker";
export {
	FIXTURE_INGESTION_QUEUE,
	type IngestFixturesResult,
	ingestFixtures,
	registerFixtureIngestionWorker,
} from "./workers/fixture-ingestion-worker";
export {
	getRateLimitedTaskJobOptions,
	RATE_LIMITED_TASK_QUEUE,
	type RateLimitedTaskJobData,
	registerRateLimitedTaskWorker,
} from "./workers/rate-limited-task-worker";

import type { JobProvider } from "./types";
import type { RateLimitedTaskJobData } from "./workers/rate-limited-task-worker";
import {
	getRateLimitedTaskJobOptions,
	RATE_LIMITED_TASK_QUEUE,
} from "./workers/rate-limited-task-worker";

/**
 * Enqueue a rate-limited task. Ensure rate_limit_config has a row for rateLimitKey
 * and a handler is registered for taskType via registerRateLimitedTaskHandler.
 */
export async function sendRateLimitedTask(
	provider: JobProvider,
	data: RateLimitedTaskJobData,
): Promise<string | null> {
	return provider.send(
		RATE_LIMITED_TASK_QUEUE,
		data as unknown as Record<string, unknown>,
		getRateLimitedTaskJobOptions(data.rateLimitKey),
	);
}

// Re-export the provider as the default export for convenience
export { jobProvider as default } from "./provider";
