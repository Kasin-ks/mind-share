"use client";

import { identify } from "@repo/monitoring";
import { SessionContext } from "@saas/auth/lib/session-context";
import { useContext, useEffect } from "react";

export function MonitoringProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	// Use context directly to avoid throwing if SessionProvider is not available
	const sessionContext = useContext(SessionContext);
	const user = sessionContext?.user ?? null;
	const loaded = sessionContext?.loaded ?? false;

	useEffect(() => {
		if (!loaded) {
			return;
		}

		identify(user ?? null);
	}, [user, loaded]);

	return <>{children}</>;
}
