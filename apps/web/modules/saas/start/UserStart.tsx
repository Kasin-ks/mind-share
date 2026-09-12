"use client";

import { config } from "@repo/config";
import { ContextMapPanel } from "@saas/mind-share/components/ContextMapPanel";
import { OrganizationsGrid } from "@saas/organizations/components/OrganizationsGrid";

export default function UserStart() {
	return (
		<div>
			{config.organizations.enable && <OrganizationsGrid />}

			<ContextMapPanel />
		</div>
	);
}
