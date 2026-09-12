/**
 * Main instrumentation file
 * Conditionally loads Node.js or Edge Runtime specific instrumentation
 */

import { initialize } from "@repo/monitoring/server";

export async function register() {
	// Initialize monitoring (works in both Node.js and Edge Runtime)
	initialize();

	// Only load Node.js-specific instrumentation (jobs) in Node.js runtime
	// This prevents Edge Runtime warnings for Node.js APIs (process.on, etc.)
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { register: registerNode } = await import(
			"./instrumentation-node"
		);
		await registerNode();
	}

	// Edge Runtime instrumentation can be added here if needed
	// if (process.env.NEXT_RUNTIME === 'edge') {
	//   const { register: registerEdge } = await import('./instrumentation-edge')
	//   await registerEdge()
	// }
}

// Re-export error handler
export { onRequestError } from "@repo/monitoring/server";
