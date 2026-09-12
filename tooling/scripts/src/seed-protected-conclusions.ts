import {
	db,
	getOrganizationBySlug,
	getUserByEmail,
	protectedConclusions,
} from "@repo/database";
import { logger } from "@repo/logs";

/**
 * Phase 2 track P2b — one-off seed for `protected_conclusions`.
 *
 * product specification §3: "Seed 2-3 `protected_conclusions` per demo user (e.g. 'job
 * searching,' 'comp band')." These are the facts demo moment 3's
 * inference-risk check (`packages/mastra/src/firewall/inference-risk.ts`)
 * protects — a requester should never be able to derive them from a
 * candidate answer, even when nothing in the answer states them outright.
 *
 * Phrased to match what's *actually* in the F3 fixtures
 * (`packages/jobs/fixtures/{jordan,priya}/*.json`), not generic examples —
 * see each row's `description` below for the specific fixture content it
 * refers to (recruiter emails, mortgage pre-approval, comp figures, etc.),
 * per this track's task instructions.
 *
 * Idempotent the same way `seed.ts`'s Mind Share block is: looks up
 * existing rows by `(ownerId, label)` first and skips rows that already
 * exist, rather than blindly inserting (this table doesn't have a natural
 * unique constraint the DB itself could enforce, since `label` is free
 * text and only meaningful in combination with `ownerId`).
 *
 * Run via `pnpm --filter @repo/scripts seed:protected-conclusions` (new
 * script below, same `dotenv -c -e ../../.env -- tsx` convention as the
 * rest of this package).
 */

interface ProtectedConclusionSeed {
	label: string;
	description: string;
}

const JORDAN_EMAIL = "jordan.blake@acme-robotics.test";
const PRIYA_EMAIL = "priya.shah@acme-robotics.test";
const ORG_SLUG = "acme-robotics";

const JORDAN_CONCLUSIONS: ProtectedConclusionSeed[] = [
	{
		label: "Actively job searching",
		description:
			"Jordan is in early conversations with an outside recruiter (Staff Engineer role at a Series B fintech, LinkedIn outreach + follow-up email from Taylor Morgan at Brightpath Talent) and hasn't decided whether to pursue it. Nothing in Jordan's context states this outright to a coworker — it should only be inferable from indirect evidence (the recruiter contact, comparing comp to 'what recruiters keep quoting'), not stated directly.",
	},
	{
		label: "Compensation above $100k",
		description:
			"Jordan's current total comp (base $128,000 + 10% target bonus + equity refresh, per the People-Ops DM/email from Renee and the payroll compensation statement) is above $100k base. This should only be inferable indirectly (e.g. the mortgage pre-approval DM 'pre-approved for way more than I expected', or the backdoor-Roth/tax-planning question) when the actual comp document itself is withheld — not stated as a bare number to a requester who shouldn't see the comp doc.",
	},
];

const PRIYA_CONCLUSIONS: ProtectedConclusionSeed[] = [
	{
		label: "Actively job searching",
		description:
			"Priya had a second-round interview for a Director of Product role at a Series D company (recruiter thread with Casey Nguyen at Northstar Search, DM to Marcus about a second-round interview and 'starting over on vesting') and is undecided about leaving. Should only be inferable from indirect evidence, not a direct statement to a coworker.",
	},
	{
		label: "Compensation above $100k",
		description:
			"Priya's current base salary ($151,000 + 15% bonus target following her promotion to Senior PM, per the People-Ops DM from Renee and the payroll compensation update) is above $100k. Should only be inferable indirectly (e.g. the $85k kitchen remodel she 'didn't even blink' at after the promotion) when the comp document itself is withheld.",
	},
];

async function seedForUser(
	email: string,
	organizationId: string,
	conclusions: ProtectedConclusionSeed[],
) {
	const user = await getUserByEmail(email);
	if (!user) {
		throw new Error(
			`Cannot seed protected_conclusions: no user found for ${email} — run 'pnpm --filter @repo/scripts seed' (F2) first.`,
		);
	}

	const existing = await db.query.protectedConclusions.findMany({
		where: (pc, { eq }) => eq(pc.ownerId, user.id),
		columns: { label: true },
	});
	const existingLabels = new Set(existing.map((row) => row.label));

	let inserted = 0;
	let skipped = 0;
	for (const conclusion of conclusions) {
		if (existingLabels.has(conclusion.label)) {
			skipped += 1;
			continue;
		}
		await db.insert(protectedConclusions).values({
			ownerId: user.id,
			organizationId,
			label: conclusion.label,
			description: conclusion.description,
		});
		inserted += 1;
	}

	logger.info(`${email}: inserted ${inserted}, skipped ${skipped}`);
}

async function main() {
	const org = await getOrganizationBySlug(ORG_SLUG);
	if (!org) {
		throw new Error(
			`Cannot seed protected_conclusions: no organization found for slug '${ORG_SLUG}' — run 'pnpm --filter @repo/scripts seed' (F2) first.`,
		);
	}

	await seedForUser(JORDAN_EMAIL, org.id, JORDAN_CONCLUSIONS);
	await seedForUser(PRIYA_EMAIL, org.id, PRIYA_CONCLUSIONS);

	logger.success("protected_conclusions seed complete.");
}

main()
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		logger.error(error);
		process.exit(1);
	});
