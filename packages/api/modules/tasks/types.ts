import { z } from "zod";

export const enqueueRateLimitedTaskSchema = z.object({
	rateLimitKey: z.string().min(1),
	taskType: z.string().min(1),
	payload: z.record(z.string(), z.unknown()).default({}),
});

export type EnqueueRateLimitedTaskInput = z.infer<
	typeof enqueueRateLimitedTaskSchema
>;
