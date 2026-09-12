import { ORPCError } from "@orpc/client";
import { mastra } from "@repo/mastra";
import { z } from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const clearChatHistory = protectedProcedure
	.route({
		method: "DELETE",
		path: "/ai-chat",
		tags: ["Mastra"],
		summary: "Clear chat history",
		description: "Delete the chat history thread from Mastra agent memory",
	})
	.input(
		z.object({
			agentId: z.string().default("weather-agent"),
			threadId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const { agentId, threadId } = input;
		const user = context.user;

		// Same thread naming as get-chat-history/stream-chat, so a user can only
		// ever clear their own thread.
		const finalThreadId = threadId || `user-${user.id}`;

		const agent = mastra.getAgentById(agentId as "weather-agent");
		if (!agent) {
			throw new ORPCError("NOT_FOUND", {
				message: `Agent ${agentId} not found`,
			});
		}

		const memory = await agent.getMemory();
		if (!memory) {
			return { success: true };
		}

		try {
			await memory.deleteThread(finalThreadId);
		} catch {
			// Nothing to delete (no thread yet) is a successful clear.
			return { success: true };
		}

		return { success: true };
	});
