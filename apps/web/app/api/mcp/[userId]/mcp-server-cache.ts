import { db } from "@repo/database";
import { createUserMcpServer } from "@repo/mastra";

/** `apps/web` doesn't declare `@mastra/mcp` as a direct dependency (only
 * `@repo/mastra` does) — pnpm's strict `node_modules` means importing its
 * `MCPServer` type directly here wouldn't resolve. `ReturnType` sidesteps
 * that without adding a redundant direct dependency just for a type. */
type MCPServer = ReturnType<typeof createUserMcpServer>;

/**
 * Phase 2 track P2d — shared helper for `apps/web/app/api/mcp/[userId]/`
 * (product specification §4). Not a `route.ts`, so Next.js doesn't treat it as a route
 * — it's imported by both `route.ts` (the SSE endpoint) and
 * `message/route.ts` (the SSE message-post endpoint), which both need to
 * dispatch to the SAME `MCPServer` instance for a given `userId` so that
 * server's in-memory SSE session map (`sseHonoTransports`, internal to
 * `@mastra/mcp`'s `MCPServer`) is shared across the two requests a real MCP
 * SSE handshake makes (GET to open the stream, POST per message).
 *
 * Caches on `globalThis` (not just a module-level `Map`) as cheap insurance
 * against this module being duplicated across separate route bundles —
 * this repo runs Next.js in `output: "standalone"` mode as one long-lived
 * `next start` process, not per-route serverless functions, so a
 * plain module-level Map would likely already be shared correctly, but the
 * `globalThis` pattern is the same one this codebase's Prisma-style
 * singletons use and costs nothing extra.
 */

const globalForMcp = globalThis as unknown as {
	__mindShareMcpServers?: Map<string, MCPServer>;
};

if (!globalForMcp.__mindShareMcpServers) {
	globalForMcp.__mindShareMcpServers = new Map();
}
const mcpServersByUserId = globalForMcp.__mindShareMcpServers;

export interface McpOwner {
	id: string;
	name: string;
	email?: string;
}

/**
 * Resolves `userId` (the `/api/mcp/[userId]` route param) to a real seeded
 * user row via `@repo/database`. Returns `null` when no such user exists —
 * callers should turn that into a 404, per the task's requirement that an
 * unknown `userId` gets a real 404 rather than a working-but-empty agent.
 */
export async function resolveMcpOwner(
	userId: string,
): Promise<McpOwner | null> {
	const row = await db.query.user.findFirst({
		where: (userTable, { eq }) => eq(userTable.id, userId),
		columns: { id: true, name: true, email: true },
	});
	if (!row) {
		return null;
	}
	return { id: row.id, name: row.name, email: row.email };
}

/**
 * Gets (or lazily builds and caches) the `MCPServer` for one user. Building
 * an `MCPServer` is cheap/synchronous (see `createUserMcpServer`'s own doc
 * comment) — the cache exists for SSE session continuity, not performance.
 */
export function getOrCreateUserMcpServer(owner: McpOwner): MCPServer {
	const cached = mcpServersByUserId.get(owner.id);
	if (cached) {
		return cached;
	}
	const server = createUserMcpServer(owner);
	mcpServersByUserId.set(owner.id, server);
	return server;
}
