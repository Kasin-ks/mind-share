import { enqueueRateLimitedTask } from "./procedures/enqueue-rate-limited-task";

export const tasksRouter = {
	enqueueRateLimited: enqueueRateLimitedTask,
};
