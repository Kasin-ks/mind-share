import type { ContextItem } from "@repo/api/modules/mind-share/types";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { ClassificationBadge } from "./ClassificationBadge";

const SOURCE_LABELS: Record<ContextItem["sourceType"], string> = {
	drive: "Drive",
	slack: "Slack",
	gmail: "Gmail",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
	dateStyle: "medium",
	timeStyle: "short",
});

/**
 * U1 — `context_items` flat table with classification badges (product specification
 * §6). Plain server component: no sorting/filtering/pagination is needed for
 * a ~14-row/user seeded dataset (product specification F3 notes), so a hand-rolled
 * `<Table>` is enough rather than pulling in `@tanstack/react-table` like the
 * organization member list does for its (genuinely interactive) use case.
 */
export function ContextItemsTable({ items }: { items: ContextItem[] }) {
	if (items.length === 0) {
		return (
			<div className="rounded-md border p-8 text-center text-foreground/60 text-sm">
				No context items yet.
			</div>
		);
	}

	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Source</TableHead>
						<TableHead>Decision</TableHead>
						<TableHead>Reason</TableHead>
						<TableHead>Classification</TableHead>
						<TableHead>Ingested</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{items.map((item) => (
						<TableRow key={item.id}>
							<TableCell className="whitespace-nowrap font-medium">
								{SOURCE_LABELS[item.sourceType]}
							</TableCell>
							<TableCell className="max-w-xs">
								{item.structuredClaim.decision || (
									<span className="text-foreground/40 italic">
										(no decision extracted)
									</span>
								)}
							</TableCell>
							<TableCell className="max-w-sm text-foreground/70">
								{item.structuredClaim.reason || (
									<span className="text-foreground/40 italic">
										—
									</span>
								)}
							</TableCell>
							<TableCell>
								<ClassificationBadge
									classification={item.classification}
								/>
							</TableCell>
							<TableCell className="whitespace-nowrap text-foreground/60 text-sm">
								{dateFormatter.format(new Date(item.createdAt))}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
