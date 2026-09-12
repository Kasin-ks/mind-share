import { logger } from "@repo/logs";
import { registerRateLimitedTaskHandler } from "../rate-limited-task-handlers";

/**
 * Register all rate-limited task handlers. Add or replace handlers here so they run when jobs are processed.
 * Called automatically on job system startup via bootstrapRateLimited().
 */
export function registerRateLimitedHandlers(): void {
	// Use case 1: 10 rpm external API — worker acquires slot then calls fetch; on 429 the job fails and retries.
	registerRateLimitedTaskHandler("call-external-api", async (payload) => {
		const {
			url,
			method = "GET",
			body,
			headers,
		} = payload as {
			url: string;
			method?: string;
			body?: unknown;
			headers?: Record<string, string>;
		};
		const res = await fetch(url, {
			method,
			headers: { "Content-Type": "application/json", ...headers },
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});
		if (res.status === 429) {
			throw new Error("Rate limited (429)");
		}
		if (!res.ok) {
			throw new Error(`Request failed: ${res.status}`);
		}
	});

	// Use case 2: 60 rpm in-app function — replace the handler body with your function (e.g. generateReport).
	registerRateLimitedTaskHandler("report-generation", async (payload) => {
		logger.info("report-generation placeholder (replace with your logic)", {
			payload,
		});
		// await yourGenerateReport(payload);
	});
}
