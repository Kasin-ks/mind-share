import { db } from "@repo/database";
import type { ContextClassification, OrgRole } from "./schemas";

/**
 * Uses `db.query.member.findFirst(...)` (Drizzle's relational query API,
 * same convention as `packages/database/drizzle/queries/organizations.ts`)
 * rather than importing `eq`/`and` from `drizzle-orm` directly — `@repo/
 * mastra` doesn't declare `drizzle-orm` as its own dependency (only `@repo/
 * database` does), and this repo's pnpm workspace doesn't hoist transitive
 * deps, so a direct `drizzle-orm` import from this package fails module
 * resolution. The relational API gets `eq`/`and` for free as callback
 * arguments instead.
 */

/**
 * Phase 2 track P2b — RBAC mapping.
 *
 * Implements product specification §3's stated classification -> RBAC mapping:
 * `member` -> `team` (and below), `admin` -> `+private` (and below),
 * `restricted` -> never auto-released regardless of role.
 *
 * Review note (flagged against P2c, applies equally here since both tracks
 * touch role logic): implement the "admin tier" check as
 * `role === "admin" || role === "owner"` (elevated roles), not a strict
 * `=== "admin"` equality — `owner` is a valid, *more* privileged Better Auth
 * org role in this schema (see `packages/auth/lib/helper.ts`'s own
 * `["owner", "admin"].includes(...)` check for the same pattern elsewhere in
 * the repo), so a strict-equality admin check would incorrectly deny an
 * `owner`-role requester content an `admin`-role requester could see.
 */

/** Numeric sensitivity rank, low -> high. Used to compare a classification
 * against a role's ceiling without a 4x3 lookup table. */
const CLASSIFICATION_RANK: Record<ContextClassification, number> = {
	public: 0,
	team: 1,
	private: 2,
	restricted: 3,
};

/** `admin` and `owner` are both "elevated" roles for RBAC purposes — see the
 * review note above. `restricted` is handled separately (never auto-released
 * regardless of role, elevated or not), so it deliberately has no ceiling
 * here. */
function isElevatedRole(role: OrgRole): boolean {
	return role === "admin" || role === "owner";
}

/** The highest classification a given org role can see *by role alone*
 * (RBAC only — this says nothing about the inference-risk check, which is a
 * separate, later gate in `checkDisclosurePolicy`). */
export function rbacCeiling(role: OrgRole): ContextClassification {
	return isElevatedRole(role) ? "private" : "team";
}

/**
 * Whether `classification` is auto-disclosable to a requester holding
 * `role`, by RBAC alone (no inference-risk consideration). `restricted`
 * always returns `false`, regardless of role — product specification is explicit that
 * `restricted` is never auto-released. A `role` of `null` means the
 * requester has no membership in the owner's organization at all, which is
 * treated as the least-privileged case (only `public` is disclosable).
 */
export function isDisclosableByRole(
	role: OrgRole | null,
	classification: ContextClassification,
): boolean {
	if (classification === "restricted") {
		return false;
	}
	if (classification === "public") {
		return true;
	}
	if (!role) {
		return false;
	}
	return (
		CLASSIFICATION_RANK[classification] <=
		CLASSIFICATION_RANK[rbacCeiling(role)]
	);
}

/**
 * Looks up the requester's org role within `organizationId` (the owner's
 * org — `context_items`/`protected_conclusions` are org-scoped, see F1).
 * Returns `null` if the requester has no membership row in that org (e.g. a
 * requester from a different org, or an unauthenticated/external caller) —
 * callers should treat that the same as the least-privileged role via
 * `isDisclosableByRole`'s `null` handling, not throw.
 *
 * The `member.role` column is free-text (Better Auth convention, default
 * `"member"`); values outside the known enum are treated as `null` (least
 * privileged) rather than crashing, since a malformed/unexpected role string
 * should fail closed, not open.
 */
export async function getRequesterOrgRole(
	requesterId: string,
	organizationId: string | null | undefined,
): Promise<OrgRole | null> {
	if (!organizationId) {
		return null;
	}

	const row = await db.query.member.findFirst({
		where: (memberTable, { and, eq }) =>
			and(
				eq(memberTable.userId, requesterId),
				eq(memberTable.organizationId, organizationId),
			),
	});

	const raw = row?.role;
	if (raw === "owner" || raw === "admin" || raw === "member") {
		return raw;
	}
	return null;
}

/**
 * Looks up the owner's own organization id, so `checkDisclosurePolicy` can
 * scope the RBAC role lookup above without requiring an explicit
 * `organizationId` argument (not part of the `checkDisclosurePolicy`
 * contract — see `check-disclosure-policy.ts`'s doc comment). Takes the
 * first membership row found; this repo's demo data has each user in
 * exactly one org (Acme Robotics, F2), so "first" is unambiguous here even
 * though the underlying schema allows multi-org membership.
 */
export async function getOwnerOrganizationId(
	ownerId: string,
): Promise<string | null> {
	const row = await db.query.member.findFirst({
		where: (memberTable, { eq }) => eq(memberTable.userId, ownerId),
	});

	return row?.organizationId ?? null;
}
