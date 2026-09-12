import { ORPCError } from "@orpc/client";
import { mastra, toAISdkV5Messages } from "@repo/mastra";
import { z } from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getChatHistory = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-chat",
		tags: ["Mastra"],
		summary: "Get chat history",
		description: "Retrieve chat history from Mastra agent memory",
	})
	.input(
		z.object({
			agentId: z.string().default("weather-agent"),
			threadId: z.string().optional(),
			resourceId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const { agentId, threadId, resourceId } = input;
		const user = context.user;

		// Use user ID for thread ID if not provided
		const finalThreadId = threadId || `user-${user.id}`;
		const finalResourceId = resourceId || `${agentId}-chat`;

		try {
			const agent = mastra.getAgentById(agentId as "weather-agent");
			if (!agent) {
				throw new ORPCError("NOT_FOUND", {
					message: `Agent ${agentId} not found`,
				});
			}

			const memory = await agent.getMemory();
			if (!memory) {
				return { messages: [] };
			}

			let response: { messages?: unknown[] } | null | undefined;
			try {
				response = (await memory.recall({
					threadId: finalThreadId,
					resourceId: finalResourceId,
				})) as { messages?: unknown[] } | null | undefined;
			} catch {
				// If recall fails (e.g., no previous conversation), return empty messages
				// This handles cases where there's no history for this thread/resource
				return { messages: [] };
			}

			const uiMessages = toAISdkV5Messages(
				(response?.messages || []) as any,
			);

			return { messages: uiMessages };
		} catch (error) {
			// If no memory found, return empty messages
			if (
				error instanceof Error &&
				error.message.includes("No previous")
			) {
				return { messages: [] };
			}
			// Re-throw other errors (like agent not found) as they indicate real issues
			throw error;
		}
	});
