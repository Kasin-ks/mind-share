import type {
	ContextGraph,
	ContextGraphEdge,
	ContextGraphNode,
	ContextItem,
} from "../types";

/**
 * Context Graph builder — pure, deterministic, derived.
 *
 * `context_items` is the source of truth; this turns a set of those rows into
 * the node/edge model the UI draws (`ContextGraphSchema` in `../types.ts`).
 * Nothing is persisted: the graph is recomputed on every read, so there is no
 * second store to keep in sync and no migration to run. Deliberately no graph
 * DB and no graph algorithms — product specification's cut list rules those out.
 *
 * Documents and claims come from each stored row. Project, person, and topic
 * nodes come from optional `structuredClaim.entities`; absent entities never
 * hide the underlying claim. Each node retains its supporting row IDs.
 */

/** Turns a human label into the stable half of a node ID, so "Turbojet",
 * "turbojet " and "TURBOJET" all collapse to one node. */
function normalizeLabel(label: string): string {
	return label
		.trim()
		.toLowerCase()
		.normalize("NFKC")
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "");
}

function nodeId(type: ContextGraphNode["type"], label: string): string {
	return `${type}:${normalizeLabel(label)}`;
}

/** Matches the `[drive:<fileId>] <file name>` header
 * `packages/jobs/workers/drive-ingestion-worker.ts` writes at the start of
 * every Drive-sourced excerpt. */
const DRIVE_HEADER_RE = /^\[drive:([^\]]+)\]\s*([^\n]*)/;

function truncate(text: string, max: number): string {
	const oneLine = text.replace(/\s+/g, " ").trim();
	return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

/**
 * Source identity for a document node. Drive rows carry their file ID in the
 * excerpt header (the same marker the ingestion job dedupes on), so two syncs
 * of the same file map to the same node; anything else falls back to the row
 * ID.
 */
function documentNodeId(item: ContextItem): string {
	const driveFileId = item.rawExcerpt.match(DRIVE_HEADER_RE)?.[1];
	return driveFileId
		? `document:drive-${driveFileId}`
		: `document:${item.id}`;
}

/** Best available human name for a document: the Drive file name when the
 * excerpt header has one, else the extracted decision, else the excerpt. */
function documentLabel(item: ContextItem): string {
	const driveName = item.rawExcerpt.match(DRIVE_HEADER_RE)?.[2]?.trim();
	if (driveName) {
		return driveName;
	}
	const decision = item.structuredClaim.decision?.trim();
	return truncate(decision || item.rawExcerpt, 48);
}

/** Accumulator that keeps the first label seen for an ID and drops repeats,
 * which is what makes the graph deduplicate across documents. */
function createCollector() {
	const nodes = new Map<string, ContextGraphNode>();
	const edges = new Map<string, ContextGraphEdge>();

	return {
		addNode(
			type: ContextGraphNode["type"],
			label: string,
			contextItemId: string,
			id?: string,
		) {
			const resolvedId = id ?? nodeId(type, label);
			if (!nodes.has(resolvedId)) {
				nodes.set(resolvedId, {
					id: resolvedId,
					label,
					type,
					contextItemIds: [],
				});
			}
			const node = nodes.get(resolvedId);
			if (node && !node.contextItemIds.includes(contextItemId)) {
				node.contextItemIds.push(contextItemId);
			}
			return resolvedId;
		},
		addEdge(source: string, target: string, type: string) {
			const id = `${source}--${type}-->${target}`;
			if (!edges.has(id)) {
				edges.set(id, { id, source, target, type });
			}
		},
		nodes,
		edges,
	};
}

export function buildContextGraph(items: ContextItem[]): ContextGraph {
	const graph = createCollector();

	for (const item of items) {
		const documentId = graph.addNode(
			"document",
			documentLabel(item),
			item.id,
			documentNodeId(item),
		);

		const entities = item.structuredClaim.entities;
		const projectLabel = entities?.project?.trim();
		const people = (entities?.people ?? []).filter((p) => p.trim());
		const topics = (entities?.topics ?? []).filter((t) => t.trim());

		const projectId = projectLabel
			? graph.addNode("project", projectLabel.trim(), item.id)
			: null;

		if (projectId) {
			graph.addEdge(documentId, projectId, "belongs_to");
		}

		// Every stored claim remains visible even when no entities were extracted.
		const decision = item.structuredClaim.decision?.trim();
		if (decision) {
			const decisionId = graph.addNode(
				"decision",
				decision,
				item.id,
				`decision:${item.id}`,
			);
			graph.addEdge(documentId, decisionId, "supports");
			if (projectId) {
				graph.addEdge(projectId, decisionId, "decided");
			}
		}

		for (const person of people) {
			const personId = graph.addNode("person", person.trim(), item.id);
			graph.addEdge(documentId, personId, "mentions");
			if (projectId) {
				graph.addEdge(projectId, personId, "involves");
			}
		}

		for (const topic of topics) {
			const topicId = graph.addNode("topic", topic.trim(), item.id);
			graph.addEdge(documentId, topicId, "contains");
			if (projectId) {
				graph.addEdge(projectId, topicId, "covers");
			}
		}
	}

	const nodes = [...graph.nodes.values()];
	const countOf = (type: ContextGraphNode["type"]) =>
		nodes.filter((node) => node.type === type).length;

	return {
		nodes,
		items,
		edges: [...graph.edges.values()],
		stats: {
			documents: countOf("document"),
			projects: countOf("project"),
			people: countOf("person"),
			topics: countOf("topic"),
		},
	};
}
