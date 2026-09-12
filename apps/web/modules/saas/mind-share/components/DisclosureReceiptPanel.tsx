"use client";

import type { DisclosureReceipt } from "@repo/api/modules/mind-share/types";
import { Badge } from "@ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/components/card";
import { cn } from "@ui/lib";
import { ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * U3 — Disclosure Receipt side panel. Renders exactly what
 * `negotiateContext`'s response actually contains (`packages/api/modules/
 * mind-share/types.ts`'s `DisclosureReceiptSchema`) — never anything more.
 *
 * `shared` entries are rendered green with their disclosed `content` and
 * `classification`. `redacted` entries are rendered red with only `summary`
 * + `classification` + `reason` — the API deliberately never sends the
 * withheld content itself (`RedactedContextEntrySchema`'s doc comment), so
 * this component has no withheld text to "helpfully" surface even if it
 * wanted to.
 *
 * `reason` is shown verbatim and in full: for an RBAC denial it reads like
 * `Classified "restricted" — never auto-disclosed regardless of requester
 * role.`; for an inference-risk block (the demo-moment-3 "ohhhhhh" case) it
 * reads like `Inference risk: this answer would let the requester derive a
 * protected conclusion ("Compensation above $100k").` — see
 * `packages/mastra/src/firewall/check-disclosure-policy.ts`'s
 * `redactionReason` construction. Both are just `reason` text on the entry;
 * this component doesn't need to special-case the inference-risk shape to
 * surface it plainly, it just needs to not hide it behind a generic label.
 */
export function DisclosureReceiptPanel({
	receipt,
	className,
}: {
	receipt: DisclosureReceipt;
	className?: string;
}) {
	const t = useTranslations("mindShare.ask.receipt");

	return (
		<Card className={cn("h-fit", className)}>
			<CardHeader>
				<CardTitle>{t("title")}</CardTitle>
				<CardDescription>{t("subtitle")}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<section className="space-y-3">
					<h4 className="flex items-center gap-2 font-semibold text-emerald-600 text-sm dark:text-emerald-400">
						<ShieldCheckIcon className="size-4" />
						{t("shared")} ({receipt.shared.length})
					</h4>
					{receipt.shared.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{t("noShared")}
						</p>
					) : (
						<ul className="space-y-2">
							{receipt.shared.map((entry, index) => (
								<li
									key={
										entry.contextItemId ?? `shared-${index}`
									}
									className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3"
								>
									<div className="flex items-center justify-between gap-2">
										<Badge status="success">
											{entry.classification}
										</Badge>
									</div>
									<p className="whitespace-pre-wrap text-sm">
										{entry.content}
									</p>
								</li>
							))}
						</ul>
					)}
				</section>

				<section className="space-y-3">
					<h4 className="flex items-center gap-2 font-semibold text-rose-600 text-sm dark:text-rose-400">
						<ShieldAlertIcon className="size-4" />
						{t("redacted")} ({receipt.redacted.length})
					</h4>
					{receipt.redacted.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{t("noRedacted")}
						</p>
					) : (
						<ul className="space-y-2">
							{receipt.redacted.map((entry, index) => (
								<li
									key={
										entry.contextItemId ??
										`redacted-${index}`
									}
									className="space-y-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3"
								>
									<div className="flex items-center justify-between gap-2">
										<Badge status="error">
											{entry.classification}
										</Badge>
									</div>
									<p className="text-sm">{entry.summary}</p>
									<p className="text-sm">
										<span className="font-semibold">
											{t("reasonLabel")}:
										</span>{" "}
										{entry.reason}
									</p>
								</li>
							))}
						</ul>
					)}
				</section>
			</CardContent>
		</Card>
	);
}
