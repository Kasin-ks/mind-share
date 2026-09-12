import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContextGraph } from "@repo/api/modules/mind-share/lib/context-graph";
import {
	ContextGraphSchema,
	type ContextItem,
} from "@repo/api/modules/mind-share/types";

function item(
	id: string,
	entities?: ContextItem["structuredClaim"]["entities"],
): ContextItem {
	return {
		id,
		ownerId: "owner",
		sourceType: "slack",
		rawExcerpt: `Original source ${id}`,
		classification: "private",
		createdAt: new Date("2026-09-12"),
		structuredClaim: {
			decision: "Ship after review",
			reason: "Review is pending",
			confidence: 0.8,
			entities,
		},
	};
}

test("claims without entities remain connected to their exact source records", () => {
	const rows = [item("a"), item("b", null)];
	const graph = ContextGraphSchema.parse(buildContextGraph(rows));
	assert.equal(
		graph.nodes.filter((node) => node.type === "decision").length,
		2,
	);
	assert.deepEqual(
		graph.nodes.find((node) => node.id === "decision:a")?.contextItemIds,
		["a"],
	);
	assert.ok(
		graph.edges.some(
			(edge) =>
				edge.source === "document:a" &&
				edge.target === "decision:a" &&
				edge.type === "supports",
		),
	);
	assert.deepEqual(graph.items, rows);
});

test("shared entities retain all supporting records and distinct Chinese labels", () => {
	const graph = buildContextGraph([
		item("a", { project: "Launch", people: ["王明"], topics: ["計劃"] }),
		item("b", { project: " launch ", people: ["李明"], topics: ["計劃"] }),
	]);
	assert.equal(graph.stats.projects, 1);
	assert.equal(graph.stats.people, 2);
	assert.deepEqual(
		graph.nodes.find((node) => node.type === "project")?.contextItemIds,
		["a", "b"],
	);
	assert.equal(graph.stats.topics, 1);
	for (const edge of graph.edges) {
		assert.ok(graph.nodes.some((node) => node.id === edge.source));
		assert.ok(graph.nodes.some((node) => node.id === edge.target));
	}
});

test("empty database produces no invented nodes or evidence", () => {
	const graph = buildContextGraph([]);
	assert.deepEqual(graph.nodes, []);
	assert.deepEqual(graph.edges, []);
	assert.deepEqual(graph.items, []);
});

test("a Drive document can support multiple distinct claims", () => {
	const rows = [item("a"), item("b")].map((row) => ({
		...row,
		sourceType: "drive" as const,
		rawExcerpt: "[drive:file-123] Planning\nSource text",
	}));
	const graph = buildContextGraph(rows);
	assert.equal(graph.stats.documents, 1);
	assert.deepEqual(
		graph.nodes.find((node) => node.type === "document")?.contextItemIds,
		["a", "b"],
	);
	assert.equal(
		graph.edges.filter((edge) => edge.type === "supports").length,
		2,
	);
});
