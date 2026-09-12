import type { AuditLogEntryWithPeople } from "@repo/api/modules/mind-share/procedures/list-audit-log";
import { Badge } from "@ui/components/badge";
import { Card, CardContent, CardHeader } from "@ui/components/card";
import { CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { ClassificationBadge } from "./ClassificationBadge";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
	dateStyle: "medium",
	timeStyle: "short",
});

/**
 * U4 — Audit trail page (product specification §6 / P2c's `context_audit_log` writes).
 * Renders one card per negotiation, from the logged-in user's point of view
 * (`viewerId`) as either the owner (someone asked about them) or the
 * requester (they asked about someone else) — the same row can theoretically
 * be both in a two-person org, but never for the same viewer, since
 * `negotiateContext` rejects self-negotiation.
 *
 * Deliberately NOT a raw `<Table>` dump: product specification calls this page out
 * specifically as what hackathon judges reward ("governance/audit
 * surfaces") and asks for it to be "clear and legible, not just a raw
 * dump" — each entry's nested `shared[]`/`redacted[]` arrays (the actual
 * governance content: what was disclosed vs. withheld, and why) don't fit
 * table cells well, so each negotiation gets its own card with a shared/
 * redacted breakdown instead.
 */
export function AuditLogTable({
	entries,
	viewerId,
}: {
	entries: AuditLogEntryWithPeople[];
	viewerId: string;
}) {
	if (entries.length === 0) {
		return (
			<div className="rounded-md border p-8 text-center text-foreground/60 text-sm">
				No audit log entries yet — nothing has asked about (or been
				asked by) this account's Context Agent.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{entries.map((entry) => {
				const isOwner = entry.ownerId === viewerId;

				return (
					<Card key={entry.id}>
						<CardHeader className="gap-3">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="flex items-center gap-2">
									<Badge
										status={isOwner ? "info" : "neutral"}
									>
										{isOwner ? "About you" : "You asked"}
									</Badge>
									<span className="text-sm">
										<strong>{entry.requester.name}</strong>
										{" asked "}
										<strong>{entry.owner.name}</strong>
										{"'s Context Agent"}
									</span>
								</div>
								<span className="whitespace-nowrap text-foreground/60 text-xs">
									{dateFormatter.format(
										new Date(entry.createdAt),
									)}
								</span>
							</div>
							<p className="text-foreground/80 text-sm">
								<span className="text-foreground/50">
									Question:{" "}
								</span>
								&ldquo;{entry.question}&rdquo;
							</p>
						</CardHeader>
						<CardContent className="space-y-4">
							{entry.shared.length > 0 && (
								<div className="space-y-2">
									<h4 className="flex items-center gap-1.5 font-medium text-emerald-600 text-xs uppercase tracking-wide">
										<CheckCircle2Icon className="size-3.5" />
										Shared ({entry.shared.length})
									</h4>
									<ul className="space-y-1.5">
										{entry.shared.map((share, i) => (
											<li
												key={i}
												className="flex items-start gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2 text-sm"
											>
												<ClassificationBadge
													classification={
														share.classification
													}
												/>
												<span className="text-foreground/80">
													{share.content}
												</span>
											</li>
										))}
									</ul>
								</div>
							)}

							{entry.redacted.length > 0 && (
								<div className="space-y-2">
									<h4 className="flex items-center gap-1.5 font-medium text-rose-600 text-xs uppercase tracking-wide">
										<XCircleIcon className="size-3.5" />
										Redacted ({entry.redacted.length})
									</h4>
									<ul className="space-y-1.5">
										{entry.redacted.map((redaction, i) => (
											<li
												key={i}
												className="space-y-1 rounded-md border border-rose-500/20 bg-rose-500/5 p-2 text-sm"
											>
												<div className="flex items-start gap-2">
													<ClassificationBadge
														classification={
															redaction.classification
														}
													/>
													<span className="text-foreground/80">
														{redaction.summary}
													</span>
												</div>
												<p className="pl-1 text-foreground/60 text-xs">
													Why: {redaction.reason}
												</p>
											</li>
										))}
									</ul>
								</div>
							)}

							<p className="border-t pt-3 text-foreground/50 text-xs">
								{entry.why}
							</p>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
