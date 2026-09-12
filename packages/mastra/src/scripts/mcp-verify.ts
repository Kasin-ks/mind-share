/**
 * P2d standalone verification script (product specification §4).
 *
 * Proves the actual MCP protocol boundary, not just that the underlying
 * agent/tools work in-process: this script hosts a real per-user
 * `MCPServer` (`../mcp/create-user-mcp-server.ts`) on a real local HTTP
 * server, then connects to it with `@mastra/mcp`'s own `MCPClient` — a
 * separate client object talking JSON-RPC over SSE, the same way an
 * external MCP client (Claude Desktop, Claude Code, a teammate's bot) would
 * connect to `/api/mcp/[userId]` in the running app. Every tool call below
 * goes through `MCPClient.listTools()` + a remote `tools/call` — never a
 * direct in-process call into the agent or firewall.
 *
 * Deliberately exercises paths that need NO live LLM call, so this script
 * gives a real pass/fail result even without an `OPENROUTER_API_KEY` — see
 * product specification's P1c/P2a/P2b notes for that recurring blocker):
 *
 *   1. That `queryOwnContext` (unfiltered raw retrieval) is NOT on the MCP
 *      tool list — a regression assertion for the disclosure boundary, see
 *      `../mcp/create-user-mcp-server.ts`.
 *   2. `checkDisclosurePolicy` with a `StructuredClaim` matching one of
 *      Jordan's real `restricted` items, requested by Priya (a `member` in
 *      the same org). RBAC denies before the inference-risk LLM check would
 *      ever run (`checkDisclosurePolicy`'s own short-circuit — see
 *      `../firewall/check-disclosure-policy.ts`), so this exercises a real,
 *      complete firewall decision (plus its `context_audit_log` write) with
 *      no model call either.
 *
 * The natural-language `ask_contextAgent` tool (the agent-as-a-tool entry,
 * see `createUserMcpServer`) is NOT exercised here — that one genuinely
 * needs a live LLM call, same as P2a's `query-context.ts` /P2b's inference
 * check, and would just reproduce the already-documented 401/403 blocker.
 *
 * Usage: `pnpm --filter @repo/mastra mcp:verify`.
 */

import { serve } from "@hono/node-server";
import type { MCPServer } from "@mastra/mcp";
import { MCPClient } from "@mastra/mcp";
import { db } from "@repo/database";
import { Hono } from "hono";
import { createUserMcpServer } from "../mcp/create-user-mcp-server";

const OWNER_EMAIL = "jordan.blake@acme-robotics.test"; // Jordan — MCP server owner
const REQUESTER_EMAIL = "priya.shah@acme-robotics.test"; // Priya — third-party requester

/** Mirrors the real `apps/web/app/api/mcp/[userId]/` route pair's PURPOSE
 * (one path to open the SSE stream, a sibling path to POST messages) on a
 * throwaway local HTTP server, calling the exact same `@mastra/mcp`
 * transport method (`startHonoSSE`) production code uses — not a simplified
 * stand-in. The URL SCHEME here deliberately differs from production's: this
 * script's `ssePath` ends in `/sse`, which — per `MCPClient`'s
 * `connectHttp` — skips the streamable-HTTP-then-fallback probe and
 * connects via SSE directly, keeping this script's own connection logic
 * minimal. Production's `/api/mcp/[userId]` (no `/sse` suffix, see
 * `route.ts`'s header comment) instead relies on the fallback probe itself
 * (a POST gets a 405 because only `GET` is exported, which `MCPClient`
 * treats as "retry via SSE") so that the single URL a human pastes into an
 * MCP client is the plain `/api/mcp/<userId>` product specification §4 describes — both
 * are real, supported `@mastra/mcp` connection paths to the same transport,
 * just reached via different client-side auto-detection. Both were verified
 * live: this script's own harness below, AND (per this track's product specification
 * notes) a real `MCPClient` connecting straight to the running
 * `apps/web` container at `/api/mcp/<userId>` with no `/sse` suffix. */
function buildMcpHonoApp(mcpServer: MCPServer, basePath: string): Hono {
	const ssePath = `${basePath}/sse`;
	const messagePath = `${basePath}/message`;

	const app = new Hono();
	app.get(ssePath, async (c) => {
		const url = new URL(c.req.url);
		return mcpServer.startHonoSSE({
			url,
			ssePath,
			messagePath,
			context: c,
		});
	});
	app.post(messagePath, async (c) => {
		const url = new URL(c.req.url);
		return mcpServer.startHonoSSE({
			url,
			ssePath,
			messagePath,
			context: c,
		});
	});
	return app;
}

async function main() {
	console.log(
		`Looking up seeded users "${OWNER_EMAIL}" / "${REQUESTER_EMAIL}"...`,
	);
	const [owner, requester] = await Promise.all([
		db.query.user.findFirst({
			where: (u, { eq }) => eq(u.email, OWNER_EMAIL),
		}),
		db.query.user.findFirst({
			where: (u, { eq }) => eq(u.email, REQUESTER_EMAIL),
		}),
	]);
	if (!owner || !requester) {
		throw new Error(
			"Seeded users not found — run 'pnpm --filter @repo/scripts seed' first.",
		);
	}
	console.log(`Owner: ${owner.name} (${owner.id})`);
	console.log(`Requester: ${requester.name} (${requester.id})`);

	const ownerRestrictedItem = await db.query.contextItems.findFirst({
		where: (ci, { and, eq }) =>
			and(eq(ci.ownerId, owner.id), eq(ci.classification, "restricted")),
	});
	if (!ownerRestrictedItem) {
		throw new Error(
			`No "restricted" context_items row found for ${owner.email} — run the ingestion jobs (P1b) first.`,
		);
	}
	console.log(
		`Using owner's real restricted item ${ownerRestrictedItem.id} for the checkDisclosurePolicy call.`,
	);

	const mcpServer = createUserMcpServer({
		id: owner.id,
		name: owner.name,
		email: owner.email,
	});
	const honoApp = buildMcpHonoApp(mcpServer, "/mcp");

	const httpServer = await new Promise<ReturnType<typeof serve>>(
		(resolve) => {
			const s = serve(
				{ fetch: honoApp.fetch, port: 0, hostname: "127.0.0.1" },
				() => {
					resolve(s);
				},
			);
		},
	);
	const address = httpServer.address();
	const port =
		typeof address === "object" && address ? address.port : undefined;
	if (!port) {
		throw new Error(
			"Failed to determine the local MCP test server's port.",
		);
	}
	console.log(
		`Local MCP test server listening on http://127.0.0.1:${port}/mcp/sse`,
	);

	const mcpClient = new MCPClient({
		id: `p2d-verify-${Date.now()}`,
		servers: {
			jordan: { url: new URL(`http://127.0.0.1:${port}/mcp/sse`) },
		},
	});

	try {
		console.log("\n=== MCPClient.listTools() ===");
		const tools = await mcpClient.listTools();
		for (const name of Object.keys(tools)) {
			console.log(`- ${name}`);
		}

		const disclosureTool = tools.jordan_checkDisclosurePolicy;
		if (!disclosureTool) {
			throw new Error(
				`Expected tools not found over MCP — got: ${Object.keys(tools).join(", ")}`,
			);
		}

		// Regression assertion for the disclosure boundary itself. `queryOwnContext`
		// is an unfiltered dump of every one of the owner's context_items at every
		// classification; exposing it on this unauthenticated transport let any
		// anonymous caller read the owner's private/restricted content with no RBAC
		// check, no inference-risk check and no audit-log row. It must stay off the
		// MCP surface — see `../mcp/create-user-mcp-server.ts`'s header comment.
		console.log(
			"\n=== Asserting raw retrieval is NOT exposed over MCP ===",
		);
		if (tools.jordan_queryOwnContext) {
			throw new Error(
				"SECURITY REGRESSION: queryOwnContext is exposed over the unauthenticated MCP transport. It returns every context_item at every classification, bypassing the Context Firewall entirely.",
			);
		}
		console.log(
			"queryOwnContext is correctly absent from the MCP tool list.",
		);

		if (!disclosureTool.execute) {
			throw new Error(
				"MCP-fetched tools unexpectedly have no execute function.",
			);
		}

		console.log(
			"\n=== Calling checkDisclosurePolicy over MCP (third-party, RBAC-only, no LLM) ===",
		);
		const decision = (await disclosureTool.execute(
			{
				claim: ownerRestrictedItem.structuredClaim,
				requesterId: requester.id,
				purpose: "verifying the P2d MCP protocol boundary",
			} as never,
			{} as never,
		)) as {
			disclosable: boolean;
			classification: string;
			redactionReason?: string;
		};
		console.log("Decision:", decision);
		if (
			decision.disclosable !== false ||
			decision.classification !== "restricted"
		) {
			throw new Error(
				`Expected a "restricted" RBAC denial, got: ${JSON.stringify(decision)}`,
			);
		}
		console.log(
			"Correctly denied over MCP: restricted item, third-party requester -> no auto-disclosure.",
		);

		const auditRow = await db.query.contextAuditLog.findFirst({
			where: (log, { and, eq }) =>
				and(
					eq(log.ownerId, owner.id),
					eq(log.requesterId, requester.id),
				),
			orderBy: (log, { desc }) => [desc(log.createdAt)],
		});
		if (!auditRow) {
			throw new Error(
				"Expected checkDisclosurePolicy's audit-log side effect to have written a context_audit_log row.",
			);
		}
		console.log(
			`\ncontext_audit_log row written as a side effect of the MCP call: id=${auditRow.id}, why="${auditRow.why}"`,
		);

		console.log(
			"\nP2d verification PASSED: real MCP client <-SSE-> MCPServer round trip, both tools callable over the wire, firewall decision + audit write all confirmed with no LLM dependency.",
		);
	} finally {
		await mcpClient.disconnect();
		await new Promise<void>((resolve, reject) => {
			httpServer.close((err) => (err ? reject(err) : resolve()));
		});
	}
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("mcp-verify script failed:", err);
		process.exitCode = 1;
	});
