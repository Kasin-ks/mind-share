import { getSession } from "@saas/auth/lib/server";
import { AuditLogTable } from "@saas/mind-share/components/AuditLogTable";
import { PageHeader } from "@saas/shared/components/PageHeader";
import { orpcClient } from "@shared/lib/orpc-client";
import Link from "next/link";
import { redirect } from "next/navigation";

/**
 * U4 — Audit trail page (product specification §6). Shows `context_audit_log` entries
 * where the logged-in user is either the owner (someone asked about them) or
 * the requester (they asked about someone else). Same plain-server-component
 * idiom as the sibling `mind-share/context` page (U1) — see that page's
 * comment for why this isn't a "use client" + react-query component.
 */
export default async function MindShareAuditPage() {
	const session = await getSession();

	if (!session) {
		redirect("/auth/login");
	}

	const { entries } = await orpcClient.mindShare.listAuditLog();

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<PageHeader
					title="Audit trail"
					subtitle="Every time your Context Agent was asked about you, or you asked about a teammate, with what was shared, what was withheld, and why."
				/>
				<Link
					href="/app/mind-share/context"
					className="whitespace-nowrap text-primary text-sm hover:underline"
				>
					View my context →
				</Link>
			</div>
			<AuditLogTable entries={entries} viewerId={session.user.id} />
		</div>
	);
}
