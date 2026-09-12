import { getContextItemsByOwnerId } from "@repo/database";
import { protectedProcedure } from "../../../orpc/procedures";
import { buildContextGraph } from "../lib/context-graph";
import { ContextGraphSchema } from "../types";

/**
 * `getContextGraph` — the Context Map's read endpoint. Derives the graph from
 * the caller's own `context_items` on every call (`../lib/context-graph.ts`);
 * nothing graph-shaped is stored, so there is no staleness to manage.
 *
 * Scoping and the deliberate lack of classification filtering mirror
 * `list-context-items.ts` exactly: `ownerId` is always `context.user.id` from
 * the Better Auth session and never client input, and classification gates
 * what's disclosed to *other* people (the firewall), not what the owner sees
 * of their own map. Same 200-row rail as that procedure.
 */
export const getContextGraph = protectedProcedure
	.route({
		method: "GET",
		path: "/mind-share/context-graph",
		tags: ["Mind Share"],
		summary: "Get the caller's derived context graph",
		description:
			"Builds a nodes/edges Context Graph from the calling user's own context_items (projects, people, topics, documents, decisions) for visualization.",
	})
	.output(ContextGraphSchema)
	.handler(async ({ context }) => {
		const items = await getContextItemsByOwnerId(context.user.id);

		return buildContextGraph(items);
	});
