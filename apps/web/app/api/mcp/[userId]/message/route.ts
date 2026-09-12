import { Hono } from "hono";
import { handle } from "hono/vercel";
import { getOrCreateUserMcpServer, resolveMcpOwner } from "../mcp-server-cache";

/**
 * Phase 2 track P2d — `/api/mcp/[userId]/message` (product specification §4).
 *
 * The message-post half of the SSE handshake started at the sibling
 * `../route.ts` (`GET /api/mcp/[userId]`) — see that file's header comment
 * for the overall design. A connected MCP client POSTs each JSON-RPC
 * request here (with `?sessionId=` identifying its open SSE stream); the
 * actual JSON-RPC *response* arrives back over that SSE stream, not in this
 * request's HTTP response (this is `@mastra/mcp`'s
 * `MCPServer.startHonoSSE`/`connectHonoSSE`'s designed behavior for the SSE
 * transport, not something invented here).
 *
 * Must resolve to the SAME cached `MCPServer` instance as `../route.ts` for
 * a given `userId` — see `../mcp-server-cache.ts`'s doc comment for why.
 */

const app = new Hono().post("/api/mcp/:userId/message", async (c) => {
	const userId = c.req.param("userId");
	const owner = await resolveMcpOwner(userId);
	if (!owner) {
		return c.json({ error: `No such user "${userId}"` }, 404);
	}

	const server = getOrCreateUserMcpServer(owner);
	const url = new URL(c.req.url);

	return server.startHonoSSE({
		url,
		ssePath: `/api/mcp/${userId}`,
		messagePath: `/api/mcp/${userId}/message`,
		context: c,
	});
});

export const POST = handle(app);
