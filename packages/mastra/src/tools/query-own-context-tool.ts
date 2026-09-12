import { createTool } from "@mastra/core/tools";
import { db } from "@repo/database";
import { z } from "zod";

/**
 * Phase 2 track P2a — `queryOwnContext` tool.
 *
 * Retrieval over ONE user's own `context_items` rows (F1,
 * `packages/database/drizzle/schema/postgres.ts`). Per product specification §2 / "Cut
 * list" #2, there's deliberately no vector DB and no separate ranking
 * algorithm: with a small seeded dataset (~14 items/user), this tool just
 * fetches that owner's full `context_items` set and hands it to the calling
 * agent as a JSON dump. The agent's own reasoning — not this tool — is what
 * decides which items are relevant to `query`. `query` is threaded through to
 * the result purely for traceability/logging (so a transcript shows what
 * question produced which dump), not used to filter the SQL.
 *
 * Schemas below intentionally *mirror* (do not import)
 * `packages/api/modules/mind-share/types.ts`'s `QueryOwnContext*` /
 * `ContextItemSchema` — same reasoning as P1c's classifier agent: `@repo/api`
 * already depends on `@repo/mastra`, so the reverse import would be
 * circular. Keep these structurally identical to that file if either changes.
 */

const ContextSourceTypeSchema = z.enum(["drive", "slack", "gmail"]);
const ContextClassificationSchema = z.enum([
	"public",
	"team",
	"private",
	"restricted",
]);
/** `.nullish()`, not `.optional()` — see `packages/api/modules/mind-share/
 * types.ts`'s `EntitiesSchema` comment (product specification "P1c-entities" notes,
 * 2026-09-12) for why. */
const EntitiesSchema = z.object({
	project: z.string().nullish(),
	people: z.array(z.string()).nullish(),
	topics: z.array(z.string()).nullish(),
});
const StructuredClaimSchema = z.object({
	decision: z.string(),
	reason: z.string(),
	confidence: z.number().min(0).max(1),
	entities: EntitiesSchema.nullish(),
});

const ContextItemSchema = z.object({
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

export const QueryOwnContextInputSchema = z.object({
	query: z.string(),
});
export type QueryOwnContextInput = z.infer<typeof QueryOwnContextInputSchema>;

export const QueryOwnContextResultSchema = z.object({
	query: z.string(),
	matches: z.array(ContextItemSchema),
});
export type QueryOwnContextResult = z.infer<typeof QueryOwnContextResultSchema>;

/** Defensive cap only — never hit by the current ~14-items/user seed. Keeps
 * the tool from silently flooding the model's context window if this table
 * ever grows well past the hackathon's seeded dataset. */
const MAX_CONTEXT_ITEMS = 200;

/**
 * Builds a `queryOwnContext` tool bound to one owner (closed over `ownerId`
 * at construction time). A fresh tool — and a fresh `contextAgent` wrapping
 * it, see `../agents/context-agent.ts` — is created per user; there is no
 * per-call `userId` argument, matching the Step 0 contract's
 * `QueryOwnContextTool = (query: string) => Promise<QueryOwnContextResult>`
 * signature (always scoped to `self`, never crosses users).
 */
export function createQueryOwnContextTool(ownerId: string) {
	return createTool({
		id: "query-own-context",
		description:
			"Retrieve the context owner's own context_items (Slack/Gmail/Drive excerpts with structured claims and disclosure classifications). Returns the owner's full context set as a JSON dump for you to reason over — this tool does not do semantic filtering itself, so read every returned item and judge relevance to the query yourself.",
		inputSchema: QueryOwnContextInputSchema,
		outputSchema: QueryOwnContextResultSchema,
		execute: async ({ query }: { query: string }) => {
			const rows = await db.query.contextItems.findMany({
				where: (contextItemsTable, { eq }) =>
					eq(contextItemsTable.ownerId, ownerId),
				orderBy: (contextItemsTable, { desc }) => [
					desc(contextItemsTable.createdAt),
				],
				limit: MAX_CONTEXT_ITEMS,
			});

			return {
				query,
				matches: rows.map((row) => ({
					id: row.id,
					ownerId: row.ownerId,
					organizationId: row.organizationId,
					sourceType: row.sourceType,
					rawExcerpt: row.rawExcerpt,
					structuredClaim: row.structuredClaim,
					classification: row.classification,
					createdAt: row.createdAt,
					updatedAt: row.updatedAt,
				})),
			};
		},
	});
}
