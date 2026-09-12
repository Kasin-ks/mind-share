import { z } from "zod";

/**
 * Mind Share / Human Context Protocol — shared contracts.
 *
 * This file is the single source of truth for the shapes that cross track
 * boundaries (ingestion, Context Agent, firewall, negotiation, UI).
 *
 * Style follows the rest of the `packages/api/modules/<name>/types.ts` files
 * in this repo: Zod schemas as the source of truth, with `z.infer` types
 * derived from them. IDs and timestamps mirror the `@paralleldrive/cuid2` +
 * `timestamp` conventions used by
 * `packages/database/drizzle/schema/postgres.ts` (see e.g. `aiChat`), so a
 * future Drizzle table for these rows can reuse these field shapes directly.
 * No Drizzle tables are defined here — that's Foundation track F1.
 */

// ---------------------------------------------------------------------------
// context_items
// ---------------------------------------------------------------------------

/** Where a context item was ingested from. Slack/Gmail are seeded fixtures
 * for the hackathon (see product specification "Cut list" #1); Drive is pulled live. */
export const ContextSourceTypeSchema = z.enum(["drive", "slack", "gmail"]);
export type ContextSourceType = z.infer<typeof ContextSourceTypeSchema>;

/** Disclosure classification. Drives both RBAC (member -> team, admin ->
 * +private, restricted -> never auto-released) and the firewall's
 * inference-risk check. */
export const ContextClassificationSchema = z.enum([
	"public",
	"team",
	"private",
	"restricted",
]);
export type ContextClassification = z.infer<typeof ContextClassificationSchema>;

/** Who/what/topic graph the classifier attaches to a claim, when
 * identifiable from the excerpt. Every field is independently nullish
 * (`null` or absent) — the classifier never fabricates a field it can't
 * clearly support. See
 * `packages/mastra/src/agents/context-classifier-agent.ts`'s instructions
 * for the exact extraction rules, and product specification's "P1c-entities" notes
 * (2026-09-12) for why this graph exists and how it's persisted.
 *
 * `.nullish()` (accepts both `null` and `undefined`), not plain
 * `.optional()`: the live classifier emits explicit `null`s for
 * fields it can't support (`.optional()` alone reproducibly broke
 * OpenRouter/gpt-4o-mini's structured-output generation — see the
 * classifier file's comment and product specification's notes for the repro), but
 * hand-constructed values elsewhere in the codebase (e.g.
 * `packages/jobs/workers/fixture-ingestion-worker.ts`'s
 * `UNCLASSIFIED_STRUCTURED_CLAIM` sentinel) omit the key entirely — this
 * schema accepts either. */
export const EntitiesSchema = z.object({
	project: z.string().nullish(),
	people: z.array(z.string()).nullish(),
	topics: z.array(z.string()).nullish(),
});
export type Entities = z.infer<typeof EntitiesSchema>;

/** The Mastra classifier step's structured extraction from a raw excerpt.
 * `entities` nests here (rather than as a sibling field on the classifier's
 * top-level output) so the whole thing persists as one JSON blob in
 * `context_items.structuredClaim` with no extra merge step. */
export const StructuredClaimSchema = z.object({
	decision: z.string(),
	reason: z.string(),
	confidence: z.number().min(0).max(1),
	entities: EntitiesSchema.nullish(),
});
export type StructuredClaim = z.infer<typeof StructuredClaimSchema>;

/**
 * A single row of the `context_items` table (product specification §1).
 * `organizationId` isn't in the product specification shape literally, but every other
 * per-user row in this repo (see `aiChat`, `purchase`) is org-scoped to
 * support the existing multi-tenant RBAC substrate (`@repo/auth`), and the
 * firewall's RBAC mapping is defined in terms of org role — so it's included
 * here as optional/nullable, matching the `aiChat.organizationId` pattern.
 */
export const ContextItemSchema = z.object({
	id: z.string(),
	ownerId: z.string(),
	organizationId: z.string().nullable().optional(),
	sourceType: ContextSourceTypeSchema,
	rawExcerpt: z.string(),
	structuredClaim: StructuredClaimSchema,
	classification: ContextClassificationSchema,
	createdAt: z.date(),
	updatedAt: z.date().nullable().optional(),
});
export type ContextItem = z.infer<typeof ContextItemSchema>;

/** Shape for inserting a new context item (id/timestamps are DB-assigned,
 * mirroring the `$defaultFn(() => cuid())` / `defaultNow()` convention). */
export const ContextItemInsertSchema = ContextItemSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
});
export type ContextItemInsert = z.infer<typeof ContextItemInsertSchema>;

// ---------------------------------------------------------------------------
// Disclosure receipt
// ---------------------------------------------------------------------------

/** One piece of context that was disclosed to the requester. */
export const SharedContextEntrySchema = z.object({
	contextItemId: z.string().optional(),
	content: z.string(),
	classification: ContextClassificationSchema,
});
export type SharedContextEntry = z.infer<typeof SharedContextEntrySchema>;

/** One piece of context that was withheld, with a human-readable reason
 * (classification/RBAC denial, or inference-risk block). Never includes the
 * withheld content itself — only a non-revealing summary. */
export const RedactedContextEntrySchema = z.object({
	contextItemId: z.string().optional(),
	summary: z.string(),
	classification: ContextClassificationSchema,
	reason: z.string(),
});
export type RedactedContextEntry = z.infer<typeof RedactedContextEntrySchema>;

/**
 * Returned by a negotiation (a requester's agent asking an owner's Context
 * Agent a question) and rendered live in the UI's Disclosure Receipt panel
 * (green = shared, red = redacted + reason). product specification §5/§6.
 */
export const DisclosureReceiptSchema = z.object({
	id: z.string(),
	requesterId: z.string(),
	ownerId: z.string(),
	question: z.string(),
	purpose: z.string(),
	shared: z.array(SharedContextEntrySchema),
	redacted: z.array(RedactedContextEntrySchema),
	createdAt: z.date(),
});
export type DisclosureReceipt = z.infer<typeof DisclosureReceiptSchema>;

// ---------------------------------------------------------------------------
// context_audit_log
// ---------------------------------------------------------------------------

/**
 * A single row of the `context_audit_log` table (product specification §3). Written on
 * every firewall check. `shared`/`redacted` reuse the disclosure receipt's
 * entry shapes (and field names) so the audit trail page (U4) can render the
 * same data the requester saw. `receiptId` links back to the live
 * `DisclosureReceipt` this row was generated from, when one exists.
 * `organizationId` mirrors `ContextItemSchema`'s field, for the same reason
 * (org-scoped audit trail pages, RBAC defined in terms of org role).
 */
export const ContextAuditLogEntrySchema = z.object({
	id: z.string(),
	receiptId: z.string().nullable().optional(),
	requesterId: z.string(),
	ownerId: z.string(),
	organizationId: z.string().nullable().optional(),
	question: z.string(),
	shared: z.array(SharedContextEntrySchema),
	redacted: z.array(RedactedContextEntrySchema),
	why: z.string(),
	createdAt: z.date(),
});
export type ContextAuditLogEntry = z.infer<typeof ContextAuditLogEntrySchema>;

export const ContextAuditLogEntryInsertSchema = ContextAuditLogEntrySchema.omit(
	{
		id: true,
		createdAt: true,
	},
);
export type ContextAuditLogEntryInsert = z.infer<
	typeof ContextAuditLogEntryInsertSchema
>;

// ---------------------------------------------------------------------------
// MCP tool signatures (packages/mastra/src/agents/context-agent.ts, P2a/P2b)
// ---------------------------------------------------------------------------

/** Input schema for `queryOwnContext`. Required by `@mastra/mcp`'s
 * `createTool`, which needs an explicit `inputSchema` (not just a return
 * type) to generate the tool's MCP definition. */
export const QueryOwnContextInputSchema = z.object({
	query: z.string(),
});
export type QueryOwnContextInput = z.infer<typeof QueryOwnContextInputSchema>;

/** Result of `queryOwnContext`: the context items the agent judged relevant
 * to the query, for the agent to reason over (no vector DB — small seeded
 * dataset, product specification "Cut list" #2). */
export const QueryOwnContextResultSchema = z.object({
	query: z.string(),
	matches: z.array(ContextItemSchema),
});
export type QueryOwnContextResult = z.infer<typeof QueryOwnContextResultSchema>;

/** Tool `queryOwnContext(query)` — retrieval over the calling user's own
 * `context_items`. Implemented by the Context Agent (P2a); always scoped to
 * `self`, never crosses users (crossing users is what `checkDisclosurePolicy`
 * + negotiation is for). */
export type QueryOwnContextTool = (
	query: string,
) => Promise<QueryOwnContextResult>;

/** Input schema for `checkDisclosurePolicy`. Required by `@mastra/mcp`'s
 * `createTool`, which needs an explicit `inputSchema` (not just a return
 * type) to generate the tool's MCP definition. */
export const CheckDisclosurePolicyInputSchema = z.object({
	claim: z.union([StructuredClaimSchema, z.string()]),
	requesterId: z.string(),
	purpose: z.string(),
});
export type CheckDisclosurePolicyInput = z.infer<
	typeof CheckDisclosurePolicyInputSchema
>;

/** Decision returned by the firewall for a single claim. `disclosable` is
 * the top-line answer; `redactionReason` is set when `false` (RBAC denial or
 * inference-risk block); `inferenceRisk` is populated only when the second
 * LLM pass (product specification §3) ran and found a derivable protected conclusion. */
export const DisclosurePolicyDecisionSchema = z.object({
	requesterId: z.string(),
	ownerId: z.string(),
	purpose: z.string(),
	classification: ContextClassificationSchema,
	disclosable: z.boolean(),
	redactionReason: z.string().optional(),
	inferenceRisk: z
		.object({
			blocked: z.boolean(),
			protectedConclusion: z.string().optional(),
			explanation: z.string().optional(),
		})
		.optional(),
});
export type DisclosurePolicyDecision = z.infer<
	typeof DisclosurePolicyDecisionSchema
>;

/** Tool `checkDisclosurePolicy(claim, requesterId, purpose)` — the Context
 * Firewall (P2b). `claim` accepts either a structured claim (from a
 * `context_items` row) or a raw text claim being evaluated ad hoc. Every
 * call is expected to also produce a `ContextAuditLogEntry` (P2c) — that
 * write is a side effect of the implementation, not part of this return
 * value. */
export type CheckDisclosurePolicyTool = (
	claim: StructuredClaim | string,
	requesterId: string,
	purpose: string,
) => Promise<DisclosurePolicyDecision>;

/** Bundle of both tools, as wrapped into an `MCPServer` at
 * `/api/mcp/[userId]` (P2d, `@mastra/mcp`). */
export interface MindShareMcpTools {
	queryOwnContext: QueryOwnContextTool;
	checkDisclosurePolicy: CheckDisclosurePolicyTool;
}

// ---------------------------------------------------------------------------
// Context Graph (derived — no table)
// ---------------------------------------------------------------------------

/**
 * The Context Graph is a *derived visualization model*, not a second
 * persistence layer: `context_items` stays the single source of truth and the
 * graph is recomputed from it on every read (see
 * `../lib/context-graph.ts`). That's why there is no Drizzle table, no graph
 * DB, and no write path here — deliberately, per product specification's cut list
 * ("no Neo4j / GraphRAG").
 */
export const ContextGraphNodeTypeSchema = z.enum([
	"project",
	"person",
	"topic",
	"document",
	"decision",
	"action",
]);
export type ContextGraphNodeType = z.infer<typeof ContextGraphNodeTypeSchema>;

/** Node IDs are deterministic `"<type>:<normalized-label>"` strings so the
 * same project/person/topic mentioned by two documents collapses into one
 * node without any ID registry. */
export const ContextGraphNodeSchema = z.object({
	id: z.string(),
	label: z.string(),
	type: ContextGraphNodeTypeSchema,
	contextItemIds: z.array(z.string()),
});
export type ContextGraphNode = z.infer<typeof ContextGraphNodeSchema>;

export const ContextGraphEdgeSchema = z.object({
	id: z.string(),
	source: z.string(),
	target: z.string(),
	type: z.string(),
});
export type ContextGraphEdge = z.infer<typeof ContextGraphEdgeSchema>;

export const ContextGraphSchema = z.object({
	nodes: z.array(ContextGraphNodeSchema),
	edges: z.array(ContextGraphEdgeSchema),
	/** Owner-scoped supporting records for inspecting a node's evidence. */
	items: z.array(ContextItemSchema),
	/** Headline counts for the UI's stats row, computed alongside the graph
	 * so the client doesn't have to re-derive them from `nodes`. */
	stats: z.object({
		documents: z.number(),
		projects: z.number(),
		people: z.number(),
		topics: z.number(),
	}),
});
export type ContextGraph = z.infer<typeof ContextGraphSchema>;

// ---------------------------------------------------------------------------
// Source sync
// ---------------------------------------------------------------------------

/** Result of one "Sync Google Drive" run. Per-document failures are counted,
 * never fatal — one unreadable file must not abort the sync. */
export const SyncSourceResultSchema = z.object({
	processed: z.number(),
	succeeded: z.number(),
	failed: z.number(),
	/** Documents already ingested on an earlier sync (deduplicated by Drive
	 * file ID), counted inside `succeeded`. */
	skipped: z.number(),
});
export type SyncSourceResult = z.infer<typeof SyncSourceResultSchema>;
