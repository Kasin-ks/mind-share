import { streamToEventIterator } from "@orpc/client";
import { handleChatStream, mastra } from "@repo/mastra";
import { z } from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const streamChat = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-chat",
		tags: ["Mastra"],
		summary: "Stream chat with AI agent",
		description: "Stream chat messages with a Mastra AI agent",
	})
	.input(
		z.object({
			messages: z.array(z.any()),
			memory: z
				.object({
					thread: z.string().optional(),
					resource: z.string().optional(),
				})
				.optional(),
			agentId: z.string().default("weather-agent"),
		}),
	)
	.handler(async ({ input, context }) => {
		const { messages, memory, agentId } = input;
		const user = context.user;

		// Use user ID for thread ID to maintain conversation per user
		const threadId = memory?.thread || `user-${user.id}`;
		const resourceId = memory?.resource || `${agentId}-chat`;

		if (!messages || messages.length === 0) {
			throw new Error("Messages must be an array of UIMessage objects");
		}

		const stream = await handleChatStream({
			mastra: mastra as any,
			agentId: agentId as "weather-agent",
			params: {
				messages: messages as any,
				memory: {
					...memory,
					thread: threadId,
					resource: resourceId,
				},
			} as any,
		});

		// Convert the stream to an event iterator for oRPC
		// handleChatStream returns a stream that can be converted to UI message stream
		if (
			stream &&
			typeof stream === "object" &&
			"toUIMessageStream" in stream &&
			typeof (stream as { toUIMessageStream: () => ReadableStream })
				.toUIMessageStream === "function"
		) {
			return streamToEventIterator(
				(
					stream as { toUIMessageStream: () => ReadableStream }
				).toUIMessageStream(),
			);
		}

		// Fallback: if it's already a readable stream, convert it directly
		return streamToEventIterator(stream as ReadableStream);
	});
