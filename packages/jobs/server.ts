/**
 * Server-side job system initialization
 *
 * This module handles starting the job provider and registering all workers.
 * It should be called from instrumentation.ts or similar startup code.
 *
 * @note This module requires Node.js runtime and is not compatible with Edge Runtime.
 * It is designed to run in instrumentation.ts which always uses Node.js runtime.
 */

import { config } from "@repo/config";
import { logger } from "@repo/logs";
import { jobProvider, setPgBossReconnectCallback } from "./provider";
import { bootstrapRateLimited } from "./rate-limited";
import { registerAllWorkers } from "./workers";

// Track workers by queue name and ID for graceful shutdown (offWork requires queue name)
let workerEntries: Array<{ queueName: string; workerId: string }> = [];
let isInitialized = false;
let extraCleanupFn: (() => Promise<void>) | undefined;

/**
 * Initialize the job system
 * Starts the job provider and registers all workers
 */
export async function initialize(): Promise<void> {
	if (isInitialized) {
		logger.warn("Job system already initialized");
		return;
	}

	if (!config.jobs?.enabled) {
		logger.info("Jobs are disabled in configuration");
		return;
	}

	try {
		// Start the job provider
		await jobProvider.start();
		logger.info("Job provider started");

		// Ensure rate-limit configs and register handlers (before workers run)
		await bootstrapRateLimited();
		logger.info("Rate-limited config and handlers ready");

		// Register all workers
		workerEntries = await registerAllWorkers(jobProvider);
		logger.info(`Registered ${workerEntries.length} job worker(s)`);

		// On connection timeout, pg-boss provider will stop and clear; this callback re-starts and re-registers workers
		setPgBossReconnectCallback(async () => {
			await jobProvider.start();
			workerEntries = await registerAllWorkers(jobProvider);
			logger.info(
				`Reconnected pg-boss and re-registered ${workerEntries.length} worker(s)`,
			);
		});

		isInitialized = true;
	} catch (error) {
		logger.error("Failed to initialize job system", error);
		// Don't throw - allow the app to start even if jobs fail
	}
}

/**
 * Stop the job system gracefully
 * Stops all workers and the job provider
 *
 * Uses fast shutdown (wait: false) to complete within Cloud Run's
 * ~10 second SIGTERM grace period. pg-boss will automatically retry
 * any interrupted jobs.
 */
export async function stop(): Promise<void> {
	if (!isInitialized) {
		return;
	}

	try {
		logger.info("Stopping job system...");

		// Stop all workers immediately (fast shutdown)
		// offWork(queueName, { id, wait: false }) — pg-boss requires the queue name as first argument
		// wait: false = don't wait for current jobs to complete (fits Cloud Run's ~10s SIGTERM window)
		// pg-boss will retry interrupted jobs automatically
		if (workerEntries.length > 0) {
			for (const { queueName, workerId } of workerEntries) {
				try {
					await jobProvider.offWork(queueName, {
						id: workerId,
						wait: false,
					});
					logger.info(`Stopped worker: ${workerId}`);
				} catch (error) {
					logger.error(`Error stopping worker ${workerId}`, error);
				}
			}
			workerEntries = [];
		}

		// Stop the job provider
		await jobProvider.stop();
		logger.info("Job system stopped");

		isInitialized = false;
	} catch (error) {
		logger.error("Error stopping job system", error);
		// Don't throw - allow process to exit cleanly
	}
}

/**
 * Setup graceful shutdown handlers
 * Should be called once during application startup
 *
 * Handles SIGTERM (Cloud Run shutdown) and SIGINT (Ctrl+C in local dev)
 * Fast shutdown ensures completion within Cloud Run's ~10s grace period.
 * If extraCleanup is provided (e.g. close DB/vector pools), it runs after stop().
 */
export function setupGracefulShutdown(cleanup?: () => Promise<void>): void {
	if (typeof process === "undefined") {
		return;
	}

	extraCleanupFn = cleanup;

	const gracefulShutdown = async (signal: string) => {
		logger.info(`Received ${signal}, shutting down job system...`);
		try {
			await stop();
			if (extraCleanupFn) {
				await extraCleanupFn();
			}
			logger.info("Job system shutdown complete");
			process.exit(0);
		} catch (error) {
			logger.error("Error during shutdown", error);
			process.exit(1);
		}
	};

	process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
	process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

/**
 * HMR disposal: when this module is replaced (e.g. Next.js dev HMR),
 * stop the job system so we don't leave orphaned PgBoss connections or duplicate workers.
 * The next initialization (e.g. on next request or re-run of register()) will start fresh.
 */
declare const module: { hot?: { dispose(cb: (data: unknown) => void): void } };
if (module?.hot?.dispose) {
	module.hot?.dispose(() => {
		logger.info("HMR: disposing job system");
		void stop()
			.then(() => extraCleanupFn?.())
			.catch((err) => logger.error("HMR job dispose error", err));
	});
}
