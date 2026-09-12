import { getSession } from "@saas/auth/lib/server";
import { ContextItemsTable } from "@saas/mind-share/components/ContextItemsTable";
import { PageHeader } from "@saas/shared/components/PageHeader";
import { orpcClient } from "@shared/lib/orpc-client";
import Link from "next/link";
import { redirect } from "next/navigation";

/**
 * U1 — `context_items` flat table with classification badges (product specification
 * §6). Plain async server component: calls `orpcClient.mindShare.
 * listContextItems()` directly (same server-side-caller idiom as
 * `apps/web/modules/saas/payments/lib/server.ts` / `chatbot/page.tsx`),
 * rather than a "use client" + react-query component like
 * `GoogleDriveTestSection` — this page has no client interactivity
 * (no buttons/refetch triggers), so there's nothing react-query buys here.
 * `listContextItems` is a `protectedProcedure`, so the real 401 is already
 * enforced server-side; `getSession`+`redirect` here is just so a logged-out
 * visitor gets a normal redirect to login instead of an oRPC error page.
 */
export default async function MindShareContextPage() {
	const session = await getSession();

	if (!session) {
		redirect("/auth/login");
	}

	const { items } = await orpcClient.mindShare.listContextItems();

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<PageHeader
					title="My context"
					subtitle="Everything your Context Agent has ingested from Slack, Gmail, and Drive, with its classification."
				/>
				<Link
					href="/app/mind-share/audit"
					className="whitespace-nowrap text-primary text-sm hover:underline"
				>
					View audit trail →
				</Link>
			</div>
			<ContextItemsTable items={items} />
		</div>
	);
}
