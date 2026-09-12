import { db } from "@repo/database";
import { z } from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { ContextItemSchema } from "../types";

/**
 * `listContextItems` — U1 (product specification §6 / "Phase 3/4 UI" table). Returns the
 * CALLING user's own `context_items` rows (Slack/Gmail/Drive), newest first,
 * for the flat table + classification badges page.
 *
 * No RBAC/classification filtering is applied here, on purpose: classification
 * gates what's disclosed to OTHER people (via `checkDisclosurePolicy` — see
 * `packages/mastra/src/firewall/check-disclosure-policy.ts` and P2b's
 * "design-tension resolution" in product specification), not what the owner can see of
 * their own data. This mirrors `queryOwnContext`'s own retrieval approach
 * (`packages/mastra/src/tools/query-own-context-tool.ts`): "classification is
 * a disclosure gate, not a retrieval gate." `ownerId` is always
 * `context.user.id` from the real Better Auth session (`protectedProcedure`)
 * — never accepted as client input — so a caller can only ever list their own
 * items, same reasoning `negotiate-context.ts` documents for `fromUserId`.
 *
 * No pagination input: the real seeded dataset is ~14 items/user (product specification
 * F3 notes), so a single capped `findMany` (limit mirrors
 * `query-own-context-tool.ts`'s own 200-row safety rail, never hit in
 * practice) is simpler than a cursor for this hackathon's scale.
 */
export const listContextItems = protectedProcedure
	.route({
		method: "GET",
		path: "/mind-share/context-items",
		tags: ["Mind Share"],
		summary: "List the caller's own context items",
		description:
			"Returns the calling user's own context_items rows (Slack/Gmail/Drive), newest first, with classification and the structured claim's decision/reason.",
	})
	.output(z.object({ items: z.array(ContextItemSchema) }))
	.handler(async ({ context }) => {
		const items = await db.query.contextItems.findMany({
			where: (contextItems, { eq }) =>
				eq(contextItems.ownerId, context.user.id),
			orderBy: (contextItems, { desc }) => [desc(contextItems.createdAt)],
			limit: 200,
		});

		return { items };
	});
