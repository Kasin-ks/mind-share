"use client";

import type {
	ContextGraph as ContextGraphData,
	ContextGraphNode,
} from "@repo/api/modules/mind-share/types";
import { ContextUniverse } from "@shared/components/ContextUniverse";
import {
	Controls,
	Handle,
	type Node,
	type NodeProps,
	Position,
	ReactFlow,
} from "@xyflow/react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import "@xyflow/react/dist/style.css";
import styles from "./context-constellation.module.css";

const COLORS: Record<ContextGraphNode["type"], string> = {
	document: "#c8eaff",
	project: "#ffffff",
	person: "#8ecaff",
	topic: "#6c9bca",
	decision: "#ffd2a0",
	action: "#efa875",
};
type StarNode = Node<{ label: string; color: string }, "star">;
function ContextStar({ data, selected }: NodeProps<StarNode>) {
	return (
		<div
			className={styles.star}
			data-selected={selected}
			style={{ color: data.color }}
		>
			<Handle
				type="target"
				position={Position.Left}
				className={styles.handle}
			/>
			<span className={styles.starLight} />
			<span className={styles.starLabel}>{data.label}</span>
			<Handle
				type="source"
				position={Position.Right}
				className={styles.handle}
			/>
		</div>
	);
}
const NODE_TYPES = { star: ContextStar };
export function ContextGraph({
	graph,
	extracting = false,
}: {
	graph: ContextGraphData;
	extracting?: boolean;
}) {
	const t = useTranslations("contextConstellation");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const selected = graph.nodes.find((node) => node.id === selectedId);
	const evidence = graph.items.filter((item) =>
		selected?.contextItemIds.includes(item.id),
	);
	const neighbors = useMemo(
		() =>
			new Set(
				graph.edges
					.filter(
						(edge) =>
							edge.source === selectedId ||
							edge.target === selectedId,
					)
					.flatMap((edge) => [edge.source, edge.target]),
			),
		[graph.edges, selectedId],
	);
	const nodes = useMemo<StarNode[]>(() => {
		const degree = new Map<string, number>();
		for (const edge of graph.edges) {
			degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
			degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
		}
		return [...graph.nodes]
			.sort(
				(a, b) =>
					(degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) ||
					a.id.localeCompare(b.id),
			)
			.map((node, i) => {
				const radius = Math.sqrt(i) * 105;
				const angle = i * 2.39996;
				return {
					id: node.id,
					type: "star",
					position: {
						x: Math.cos(angle) * radius,
						y: Math.sin(angle) * radius * 0.7,
					},
					data: { label: node.label, color: COLORS[node.type] },
					selected: node.id === selectedId,
					ariaLabel: `${t(node.type)}: ${node.label}`,
					style: {
						opacity:
							selected &&
							!neighbors.has(node.id) &&
							node.id !== selectedId
								? 0.25
								: 1,
					},
				};
			});
	}, [graph, selectedId, selected, neighbors, t]);
	const edges = useMemo(
		() =>
			graph.edges.map((edge) => {
				const active =
					edge.source === selectedId || edge.target === selectedId;
				return {
					...edge,
					type: "default",
					label: active ? t(`relationships.${edge.type}`) : undefined,
					style: {
						stroke: active ? "#bce5ff" : "#6494b4",
						strokeWidth: active ? 1.5 : 0.7,
						opacity: active ? 0.85 : selected ? 0.05 : 0.2,
					},
					labelStyle: { fill: "#deefff", fontSize: 11 },
					labelBgStyle: { fill: "#07131c", fillOpacity: 0.95 },
				};
			}),
		[graph.edges, selectedId, selected, t],
	);
	return (
		<div
			className={styles.universe}
			data-extracting={extracting}
			aria-busy={extracting}
		>
			<ContextUniverse
				speed={extracting ? "active" : "ambient"}
				glow={extracting}
			/>
			<div className={styles.heading}>
				<span className={styles.eyebrow}>{t("eyebrow")}</span>
				<h3>{extracting ? t("extracting") : t("title")}</h3>
				<p role="status">
					{extracting ? t("extractingDescription") : t("description")}
				</p>
			</div>
			{graph.nodes.length > 0 ? (
				<ReactFlow
					style={{ background: "transparent" }}
					nodes={nodes}
					edges={edges}
					nodeTypes={NODE_TYPES}
					fitView
					fitViewOptions={{ padding: 0.35, maxZoom: 1 }}
					minZoom={0.15}
					maxZoom={2}
					nodesDraggable={false}
					nodesConnectable={false}
					edgesFocusable={false}
					onNodeClick={(_, node) => setSelectedId(node.id)}
					onPaneClick={() => setSelectedId(null)}
					onNodesChange={(changes) => {
						for (const change of changes) {
							if (change.type === "select" && change.selected) {
								setSelectedId(change.id);
							}
						}
					}}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							setSelectedId(null);
						}
					}}
					proOptions={{ hideAttribution: true }}
					colorMode="dark"
				>
					<Controls showInteractive={false} />
				</ReactFlow>
			) : (
				<div className={styles.empty}>
					{extracting ? t("forming") : t("empty")}
				</div>
			)}
			{selected && (
				<div className={styles.details} aria-live="polite">
					<span className={styles.eyebrow}>{t(selected.type)}</span>
					<p>{selected.label}</p>
					<h4>{t("evidence", { count: evidence.length })}</h4>
					{evidence.map((item) => (
						<article key={item.id} className={styles.evidence}>
							<span className={styles.eyebrow}>
								{item.sourceType} · {item.classification}
							</span>
							<p>{item.structuredClaim.decision}</p>
							<p>{item.structuredClaim.reason}</p>
							<p>
								{t("confidence", {
									value: Math.round(
										item.structuredClaim.confidence * 100,
									),
								})}
							</p>
							<details>
								<summary>{t("source")}</summary>
								<p>{item.rawExcerpt}</p>
							</details>
							<small>
								{t("recordId")}: {item.id}
							</small>
						</article>
					))}
					<button type="button" onClick={() => setSelectedId(null)}>
						{t("clear")}
					</button>
				</div>
			)}
			<div className={styles.legend}>
				{(Object.keys(COLORS) as ContextGraphNode["type"][]).map(
					(type) => (
						<span key={type}>
							<i
								style={{
									background: COLORS[type],
									color: COLORS[type],
								}}
							/>
							{t(type)}
						</span>
					),
				)}
			</div>
		</div>
	);
}
