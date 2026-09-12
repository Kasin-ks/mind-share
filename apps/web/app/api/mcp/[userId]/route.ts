import { Hono } from "hono";
import { handle } from "hono/vercel";
import { getOrCreateUserMcpServer, resolveMcpOwner } from "./mcp-server-cache";

/**
 * Phase 2 track P2d — `/api/mcp/[userId]` (product specification §4).
 *
 * This is the SSE entry point of one user's Context Agent MCP server: an
 * external MCP client (Claude Desktop, Claude Code, a teammate's bot, or the
 * future `negotiateContext` procedure) connects here with `GET` to open a
 * server-sent-events stream, per `@mastra/mcp`'s `MCPServer.startHonoSSE`
 * (the actual transport this repo's pinned `@mastra/mcp@^1.1.0` exports —
 * see `packages/mastra/src/mcp/create-user-mcp-server.ts` for why SSE, not
 * the newer streamable-HTTP transport, was chosen: `MCPServer.startHTTP`
 * requires a real Node `http.IncomingMessage`/`http.ServerResponse`, which a
 * Next.js Route Handler's Web-standard `Request`/`Response` can't produce
 * without a nontrivial custom shim; `startHonoSSE` takes a Hono `Context`
 * instead, which this repo already knows how to bridge to Next.js — see
 * `apps/web/app/api/ai-chat/route.ts` / `apps/web/app/api/[[...rest]]/
 * route.ts` for the same `hono` + `hono/vercel` `handle()` pattern used
 * here).
 *
 * The client's first JSON-RPC message goes to `message/route.ts` (a sibling
 * file, not this one) — the MCP SSE handshake requires two distinct paths
 * (one to open the stream, one to POST messages against it); the client
 * discovers the message path itself from the `endpoint` SSE event, so a
 * caller only ever needs to know this one URL to connect
 * (`/api/mcp/<userId>`).
 *
 * Auth: intentionally open to any caller — see the SECURITY/AUTH GAP comment
 * in `packages/mastra/src/mcp/create-user-mcp-server.ts` for why, and what a
 * real fix looks like.
 */

const app = new Hono().get("/api/mcp/:userId", async (c) => {
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

// Only GET is wired up on purpose: an MCP client that first probes this URL
// with a streamable-HTTP-style POST should get Next's default 405 (no POST
// handler exported here), which `@mastra/mcp`'s client treats as one of the
// documented SSE-fallback status codes and retries as SSE instead — see
// `MCPClient`'s `connectHttp` (SSE_FALLBACK_STATUS_CODES = [400, 404, 405]).
export const GET = handle(app);
