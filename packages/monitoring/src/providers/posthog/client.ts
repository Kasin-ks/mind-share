import posthog from "posthog-js";

import type { MonitoringProviderClientStrategy } from "../../types";
import { posthogHost, posthogKey } from "./config";

// Client-side exports
export const {
	captureException,
	identify,
	initialize,
	onRouterTransitionStart,
} = {
	captureException: (exception: unknown) => {
		posthog.captureException(exception);
	},
	identify: <T extends { id: string }>(user: T | null) => {
		if (user) {
			posthog.identify(user.id);
		} else {
			posthog.reset();
		}
	},
	initialize: () => {
		if (!posthogKey) {
			return;
		}
		// Check if PostHog is already initialized (e.g., by analytics module)
		// PostHog sets __loaded flag when initialized
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		if ((posthog as { __loaded?: boolean }).__loaded) {
			return;
		}
		posthog.init(posthogKey, {
			api_host: posthogHost,
		});
	},
	onRouterTransitionStart: () => {
		/*  PostHog does not provide a way to capture router transitions yet */
	},
} satisfies MonitoringProviderClientStrategy;
