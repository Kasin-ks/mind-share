/**
 * P2c standalone verification script for `writeAuditLogEntry`
 * (`../firewall/audit-log.ts`).
 *
 * Exercises the real DB round trip — no LLM call, no mocking — against the
 * live Postgres instance: resolves the two seeded demo users (Jordan as
 * owner, Priya as requester, F2) and the shared "Acme Robotics" org, then
 * writes one realistic `context_audit_log` row modeled on a
 * "what's their salary" question a requester's agent might ask. One item is
 * marked shared (a public-safe status update), one redacted (citing the real
 * seeded compensation-statement `context_items` row, F3) with a `why` a
 * human could read on the audit trail page (U4).
 *
 * This intentionally does not call P2b's `checkDisclosurePolicy` (not yet
 * built / requires the LLM classifier's API key, product specification's known
 * blocker) — it calls `writeAuditLogEntry` directly with a hand-built
 * decision, which is exactly the contract P2b is expected to call this
 * module with once it exists.
 *
 * Usage: `pnpm --filter @repo/mastra write:sample-audit-log`.
 */

import { db } from "@repo/database";
import { writeAuditLogEntry } from "../firewall/audit-log";

const OWNER_EMAIL = "jordan.blake@acme-robotics.test"; // Jordan — owner
const REQUESTER_EMAIL = "priya.shah@acme-robotics.test"; // Priya — requester
const ORG_SLUG = "acme-robotics";

/** Real seeded `context_items` row (F3 fixtures) — Jordan's July comp
 * statement email, currently sitting at the P1b placeholder classification
 * `restricted` pending P1c's classifier run. Cited here for realism in the
 * redacted entry; the entry's own `classification` field below reflects the
 * decision this hypothetical firewall check made, independent of whatever
 * `context_items.classification` currently holds. */
const COMP_STATEMENT_CONTEXT_ITEM_ID = "ey6pllidltfc3xjcf9rpsecf";

/** Real seeded `context_items` row — a public-safe engineering status
 * update, used as the shared entry. */
const STATUS_UPDATE_CONTEXT_ITEM_ID = "n7osh9uy8lkw36nqimaz3aj0";

async function main() {
	const [owner, requester, org] = await Promise.all([
		db.query.user.findFirst({
			where: (user, { eq }) => eq(user.email, OWNER_EMAIL),
		}),
		db.query.user.findFirst({
			where: (user, { eq }) => eq(user.email, REQUESTER_EMAIL),
		}),
		db.query.organization.findFirst({
			where: (organization, { eq }) => eq(organization.slug, ORG_SLUG),
		}),
	]);

	if (!owner) {
		throw new Error(
			`Owner user not found for email "${OWNER_EMAIL}" — run the seed script (F2) first.`,
		);
	}
	if (!requester) {
		throw new Error(
			`Requester user not found for email "${REQUESTER_EMAIL}" — run the seed script (F2) first.`,
		);
	}
	if (!org) {
		throw new Error(
			`Organization not found for slug "${ORG_SLUG}" — run the seed script (F2) first.`,
		);
	}

	console.log("Writing sample context_audit_log entry...", {
		ownerId: owner.id,
		requesterId: requester.id,
		organizationId: org.id,
	});

	const row = await writeAuditLogEntry({
		requesterId: requester.id,
		ownerId: owner.id,
		organizationId: org.id,
		question: "what's their salary",
		shared: [
			{
				contextItemId: STATUS_UPDATE_CONTEXT_ITEM_ID,
				content:
					"Jordan shipped the retry-queue fix for billing webhooks this morning.",
				classification: "public",
			},
		],
		redacted: [
			{
				contextItemId: COMP_STATEMENT_CONTEXT_ITEM_ID,
				summary: "A compensation-related document.",
				classification: "restricted",
				reason: "Compensation figures are classified restricted and are never auto-released, regardless of requester role (product specification §3 RBAC mapping).",
			},
		],
		why: "Requester (member role) asked about the owner's salary. RBAC mapping restricts salary/comp content to the owner only; the one relevant context item was withheld and a redaction reason was returned instead of the underlying figure. An unrelated public status update was shared to demonstrate partial disclosure.",
	});

	console.log("context_audit_log row written:");
	console.log(JSON.stringify(row, null, 2));
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("write-sample-audit-log script crashed:", error);
		process.exitCode = 1;
	});
