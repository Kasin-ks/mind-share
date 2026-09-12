/**
 * Registry of handlers for rate-limited tasks. App registers handlers by taskType;
 * the rate-limited-task worker looks up and runs the handler after acquiring a slot.
 */
export type RateLimitedTaskHandler = (
	payload: Record<string, unknown>,
) => Promise<void>;

const handlers = new Map<string, RateLimitedTaskHandler>();

export function registerRateLimitedTaskHandler(
	taskType: string,
	handler: RateLimitedTaskHandler,
): void {
	handlers.set(taskType, handler);
}

export function getRateLimitedTaskHandler(
	taskType: string,
): RateLimitedTaskHandler | undefined {
	return handlers.get(taskType);
}
