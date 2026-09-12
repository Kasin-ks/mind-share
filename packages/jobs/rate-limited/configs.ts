import { setRateLimitConfig } from "@repo/database";

export interface RateLimitConfigEntry {
	key: string;
	windowSeconds: number;
	maxSlots: number;
	retentionMinutes: number;
}

/**
 * All rate-limit keys and their config. Add entries here to track and auto-apply config on startup.
 */
export const RATE_LIMIT_CONFIGS: RateLimitConfigEntry[] = [
	{
		key: "external-api",
		windowSeconds: 60,
		maxSlots: 10,
		retentionMinutes: 5,
	},
	{
		key: "report-generation",
		windowSeconds: 60,
		maxSlots: 60,
		retentionMinutes: 5,
	},
];

/**
 * Ensure all RATE_LIMIT_CONFIGS are written to the database. Call on job system startup.
 */
export async function ensureRateLimitConfigs(): Promise<void> {
	for (const c of RATE_LIMIT_CONFIGS) {
		await setRateLimitConfig(c.key, {
			windowSeconds: c.windowSeconds,
			maxSlots: c.maxSlots,
			retentionMinutes: c.retentionMinutes,
		});
	}
}
