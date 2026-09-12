import { MCPServer } from "@mastra/mcp";
import {
	type ContextAgentOwner,
	createContextAgent,
} from "../agents/context-agent";
import { createCheckDisclosurePolicyTool } from "../tools/check-disclosure-policy-tool";

/**
 * Phase 2 track P2d — wraps one user's Context Agent (P2a,
 * `../agents/context-agent.ts`) as an MCP server (product specification §4).
 *
 * This is what makes the Human Context Protocol a real protocol boundary
 * instead of a chat window: any MCP client (Claude Desktop, Claude Code,
 * a teammate's bot, or the future `negotiateContext` procedure) can connect
 * to `createUserMcpServer(owner)`'s HTTP transport and either (a) call
 * `checkDisclosurePolicy` directly as a raw tool, or (b) call
 * `ask_contextAgent` (the auto-generated tool for the `agents` entry below)
 * to talk to the full reasoning agent in natural language.
 *
 * ---------------------------------------------------------------------
 * WHY `queryOwnContext` IS NOT EXPOSED HERE
 * ---------------------------------------------------------------------
 * `queryOwnContext` (`../tools/query-own-context-tool.ts`) is an UNFILTERED
 * `SELECT * FROM context_items WHERE ownerId = <owner>` — every row, at
 * every classification, `rawExcerpt` included. That is correct and
 * deliberate for its intended caller: the owner's own agent, reasoning
 * internally, where classification is a disclosure gate rather than a
 * retrieval gate (product specification's P2b design-tension resolution). The agent
 * built below still holds it and still uses it that way.
 *
 * But this MCP server is an open, unauthenticated transport. Publishing that
 * tool on it hands any anonymous caller the owner's entire `private`/
 * `restricted` context verbatim — salary figures, recruiter threads, the
 * lot — with no RBAC check, no inference-risk check, no audit-log row, and
 * without even having to claim an identity. It bypasses the Context Firewall
 * completely rather than being gated by it, which inverts the whole premise
 * of this project (product specification: "Nobody gets raw file/message access to
 * someone else's context"). An earlier revision of this file did expose it;
 * that was verified to be live-exploitable against the real route and has
 * been removed. Do not add it back to `tools` below — if a caller needs an
 * LLM-free way to exercise the protocol, `checkDisclosurePolicy` provides
 * one and is firewall-gated by construction.
 *
 * Per `../agents/context-agent.ts`'s own header comment: build this from the
 * real requested `userId` (resolved to a real `{id, name, email}` row by the
 * caller — e.g. `apps/web/app/api/mcp/[userId]/`), never from the shared
 * `contextAgent`/registry singleton in `../mastra.ts`, which only represents
 * one hardcoded demo user for the Mastra dev playground.
 *
 * ---------------------------------------------------------------------
 * SECURITY / AUTH GAP — read before wiring this up to a public endpoint
 * ---------------------------------------------------------------------
 * `checkDisclosurePolicy(claim, requesterId, purpose)` treats `requesterId`
 * as a plain caller-supplied argument and uses it, as-is, to look up a real
 * org role (RBAC) and to attribute the resulting `context_audit_log` row.
 * Nothing on this MCP server's transport authenticates the connecting
 * client or binds `requesterId` to a verified identity — an MCP caller can
 * pass ANY `requesterId` (e.g. an org admin's real id) and inherit that
 * person's RBAC tier, and can write audit-log rows under an identity that
 * isn't actually theirs. This is a real gap, not an oversight papered over:
 * product specification's own framing is that this endpoint is *intentionally* open to
 * any caller (the disclosure boundary is enforced inside the firewall, not
 * by blocking the connection) — but that framing assumes `requesterId`
 * itself is trustworthy, which today it is not for a public-internet caller.
 *
 * Scope of what that does and does not buy an attacker, so this isn't
 * over- or under-stated: `checkDisclosurePolicy` returns a *decision*
 * (`disclosable`/`classification`/`redactionReason`), never the claim's
 * content — the caller has to already hold the claim they're asking about.
 * So spoofing `requesterId` yields a disclosure oracle and forged audit-log
 * attribution, not a direct read of the owner's context. That is a genuine
 * bug and it should be closed before this is trusted in the open, but it is
 * a different and lesser thing than handing over the rows themselves, which
 * is why the raw-`queryOwnContext` exposure above was removed outright
 * rather than merely documented.
 *
 * The agent below is built with `audience: "untrusted"` for the same reason:
 * its default system prompt has a "self-query" mode that grants full access
 * at every classification when no requester is identified, which is exactly
 * the state an anonymous MCP caller presents. On this transport that mode is
 * removed and every request is treated as third-party — see
 * `../agents/context-agent.ts`'s `ContextAgentAudience`. Note this is
 * prompt-level enforcement, so it is a mitigation, not a guarantee: the
 * hard guarantees on this surface are `checkDisclosurePolicy`'s RBAC check
 * and the absence of any raw-retrieval tool.
 *
 * The safe calling convention today is a trusted, internal caller — e.g. the
 * future `negotiateContext(fromUserId, toUserId, question, purpose)`
 * procedure, which already knows the real `fromUserId` from its own
 * authenticated Better Auth session and can pass it through as
 * `requesterId` truthfully. Whoever builds `negotiateContext` next should
 * either (a) call these tools in-process (import `createUserMcpServer`'s
 * underlying agent/tools directly, no network hop, no spoofing surface), or
 * (b) if it goes over this MCP transport, add a real auth layer first (e.g.
 * an API key or session token minted per user that this server verifies and
 * uses to override/validate the caller-supplied `requesterId`, or `@mastra/
 * mcp`'s OAuth middleware support — see its `server/oauth-middleware`
 * export). Do not "fix" this by defaulting `requesterId` to something
 * privileged — that would silently bypass RBAC for every caller instead of
 * flagging the gap.
 */

const MCP_SERVER_VERSION = "0.1.0";

/**
 * Builds an `MCPServer` exposing one user's Context Agent. Stateless/cheap
 * to construct (no network calls) — safe to call per-request; callers that
 * serve this over a long-lived HTTP transport (SSE has server-side session
 * state, see `MCPServer.startHonoSSE`) should cache the returned instance
 * per `owner.id` themselves rather than rebuilding it on every request. See
 * `apps/web/app/api/mcp/[userId]/mcp-server-cache.ts` for that caching.
 */
export function createUserMcpServer(owner: ContextAgentOwner): MCPServer {
	const agent = createContextAgent(owner, { audience: "untrusted" });

	return new MCPServer({
		id: `context-agent-mcp-${owner.id}`,
		name: `${owner.name}'s Context Agent`,
		version: MCP_SERVER_VERSION,
		description:
			`MCP server for the Human Context Protocol ("Mind Share") — exposes ${owner.name}'s ` +
			"Context Agent over MCP so another person's agent, coding assistant, or MCP client " +
			"can ask for context directly (product specification §4), instead of getting raw file/message " +
			"access. `checkDisclosurePolicy` is exposed as a raw tool for direct protocol-level " +
			"firewall checks; `ask_contextAgent` (from the `agents` entry) exposes the full " +
			"reasoning agent for natural-language questions. Raw unfiltered retrieval over " +
			`${owner.name}'s context is deliberately NOT exposed over this transport.`,
		tools: {
			checkDisclosurePolicy: createCheckDisclosurePolicyTool(owner.id),
		},
		agents: {
			contextAgent: agent,
		},
	});
}
