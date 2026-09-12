import { jobProvider, sendRateLimitedTask } from "@repo/jobs";
import { protectedProcedure } from "../../../orpc/procedures";
import { enqueueRateLimitedTaskSchema } from "../types";

export const enqueueRateLimitedTask = protectedProcedure
	.route({
		method: "POST",
		path: "/tasks/enqueue-rate-limited",
		tags: ["Tasks"],
		summary:
			"Enqueue a rate-limited task (auth + validation + enqueue only)",
	})
	.input(enqueueRateLimitedTaskSchema)
	.handler(async ({ input }) => {
		const jobId = await sendRateLimitedTask(jobProvider, {
			rateLimitKey: input.rateLimitKey,
			taskType: input.taskType,
			payload: input.payload,
		});
		return { jobId };
	});
