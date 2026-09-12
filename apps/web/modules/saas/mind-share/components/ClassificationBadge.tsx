import type { ContextClassification } from "@repo/api/modules/mind-share/types";
import type { BadgeProps } from "@ui/components/badge";
import { Badge } from "@ui/components/badge";

/**
 * Classification -> badge color, ordered by sensitivity (U1/U4, product specification
 * §6): green (public) -> gray (team) -> amber (private) -> red (restricted).
 * Reuses `@ui/components/badge`'s existing status variants rather than
 * hand-rolled colors (`neutral` was added there for this — see its comment).
 */
const CLASSIFICATION_BADGE_STATUS: Record<
	ContextClassification,
	NonNullable<BadgeProps["status"]>
> = {
	public: "success",
	team: "neutral",
	private: "warning",
	restricted: "error",
};

export function ClassificationBadge({
	classification,
}: {
	classification: ContextClassification;
}) {
	return (
		<Badge status={CLASSIFICATION_BADGE_STATUS[classification]}>
			{classification}
		</Badge>
	);
}
