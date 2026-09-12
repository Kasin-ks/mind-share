import { AskTeammateView } from "@saas/mind-share/components/AskTeammateView";
import { PageHeader } from "@saas/shared/components/PageHeader";
import { getTranslations } from "next-intl/server";

/**
 * U2/U3 — "Ask a teammate's agent" (product specification §6 / demo moment 3's "room-
 * goes-'ohhhhhh'" page). Base session auth + org-membership gating already
 * happen in `app/(saas)/app/layout.tsx` (same as every other `(account)`
 * route, e.g. `ai-chat`), so this page just renders the header + the client
 * component that does the real work (teammate picker, question/purpose form,
 * answer + Disclosure Receipt).
 */
export default async function MindShareAskPage() {
	const t = await getTranslations("mindShare.ask");

	return (
		<div className="space-y-8">
			<PageHeader title={t("title")} subtitle={t("subtitle")} />
			<AskTeammateView />
		</div>
	);
}
