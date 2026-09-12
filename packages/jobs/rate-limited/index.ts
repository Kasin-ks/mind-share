import { ensureRateLimitConfigs } from "./configs";
import { registerRateLimitedHandlers } from "./handlers";

export type { RateLimitConfigEntry } from "./configs";
export { ensureRateLimitConfigs, RATE_LIMIT_CONFIGS } from "./configs";
export { registerRateLimitedHandlers } from "./handlers";

/**
 * Ensure rate-limit configs in DB and register all task handlers. Call once when the job system starts.
 */
export async function bootstrapRateLimited(): Promise<void> {
	await ensureRateLimitConfigs();
	registerRateLimitedHandlers();
}
