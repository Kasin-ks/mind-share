import { closeDbPool } from "@repo/database";
import { logger } from "@repo/logs";

/**
 * Run post-job-shutdown cleanup: close the app DB pool.
 * Called from setupGracefulShutdown after job workers are stopped.
 */
export async function runPostJobShutdownCleanup(): Promise<void> {
	logger.info("Closing DB pool...");
	await closeDbPool();
}
