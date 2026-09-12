/**
 * Node.js-specific instrumentation
 * This file is only loaded when running in Node.js runtime (not Edge Runtime)
 * Contains code that uses Node.js APIs like process.on and process.exit
 */

import {
	initialize as initializeJobs,
	setupGracefulShutdown,
} from "@repo/jobs";
import { runPostJobShutdownCleanup } from "./lib/shutdown";

export async function register() {
	// Initialize job system (starts provider and registers all workers)
	await initializeJobs();

	// Setup graceful shutdown: stop workers, then close DB (and optional vector) pools
	setupGracefulShutdown(runPostJobShutdownCleanup);
}
