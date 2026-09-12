import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "../client";
import { rateLimitConfig, rateLimitSlots } from "../schema/postgres";

export interface RateLimitConfig {
	windowSeconds: number;
	maxSlots: number;
	retentionMinutes: number;
}

/**
 * Get rate limit config for a key. Returns null if not configured.
 */
export async function getRateLimitConfig(
	key: string,
): Promise<RateLimitConfig | null> {
	const row = await db.query.rateLimitConfig.findFirst({
		where: (c, { eq }) => eq(c.id, key),
	});
	if (!row) {
		return null;
	}
	return {
		windowSeconds: row.windowSeconds,
		maxSlots: row.maxSlots,
		retentionMinutes: row.retentionMinutes,
	};
}

function keyToLockId(key: string): number {
	let h = 0;
	for (let i = 0; i < key.length; i++) {
		h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
	}
	return Math.abs(h);
}

/**
 * Acquire one slot for the given rate-limit key (rolling window).
 * Blocks until a slot is available. Uses advisory lock per key.
 */
export async function acquireRateLimitSlot(key: string): Promise<void> {
	const config = await getRateLimitConfig(key);
	if (!config) {
		throw new Error(`Rate limit config not found for key: ${key}`);
	}

	const { windowSeconds, maxSlots, retentionMinutes } = config;
	const lockId = keyToLockId(key);

	for (;;) {
		const result = await db.transaction(async (tx) => {
			await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockId})`);

			const retentionSeconds = retentionMinutes * 60;
			const cutoffRetention = new Date(
				Date.now() - retentionSeconds * 1000,
			);
			const cutoffWindow = new Date(Date.now() - windowSeconds * 1000);

			await tx
				.delete(rateLimitSlots)
				.where(
					and(
						eq(rateLimitSlots.id, key),
						lt(rateLimitSlots.slotAt, cutoffRetention),
					),
				);

			const countResult = await tx
				.select({ count: sql<number>`count(*)::int` })
				.from(rateLimitSlots)
				.where(
					and(
						eq(rateLimitSlots.id, key),
						gt(rateLimitSlots.slotAt, cutoffWindow),
					),
				);

			const count = countResult[0]?.count ?? 0;

			if (count < maxSlots) {
				await tx.insert(rateLimitSlots).values({
					id: key,
					slotAt: new Date(),
					slotId: crypto.randomUUID(),
				});
				return { acquired: true as const };
			}

			const minResult = await tx
				.select({
					minSlotAt: sql<Date>`min(${rateLimitSlots.slotAt})`,
				})
				.from(rateLimitSlots)
				.where(
					and(
						eq(rateLimitSlots.id, key),
						gt(rateLimitSlots.slotAt, cutoffWindow),
					),
				);

			const minSlotAt = minResult[0]?.minSlotAt;
			if (!minSlotAt) {
				return { acquired: true as const };
			}

			const nextSlotAt = new Date(
				new Date(minSlotAt).getTime() + windowSeconds * 1000,
			);
			return { acquired: false as const, nextSlotAt };
		});

		if (result.acquired) {
			return;
		}

		const waitMs = Math.max(0, result.nextSlotAt.getTime() - Date.now());
		await new Promise((resolve) => setTimeout(resolve, waitMs));
	}
}

/**
 * Insert or update rate limit config for a key.
 */
export async function setRateLimitConfig(
	key: string,
	config: RateLimitConfig,
): Promise<void> {
	await db
		.insert(rateLimitConfig)
		.values({
			id: key,
			windowSeconds: config.windowSeconds,
			maxSlots: config.maxSlots,
			retentionMinutes: config.retentionMinutes,
		})
		.onConflictDoUpdate({
			target: rateLimitConfig.id,
			set: {
				windowSeconds: config.windowSeconds,
				maxSlots: config.maxSlots,
				retentionMinutes: config.retentionMinutes,
			},
		});
}
