import { PostHog } from "posthog-node";

import { posthogHost, posthogKey } from "./config";

// Server-side instance
let posthogInstance: PostHog | null = null;

export function getPostHogServer() {
	if (!posthogKey) {
		return null;
	}

	posthogInstance ??= new PostHog(posthogKey, {
		host: posthogHost,
		flushAt: 1,
		flushInterval: 0,
	});

	return posthogInstance;
}

// Server-side exports
export const server = {
	captureException: (exception: unknown, extra?: Record<string, unknown>) => {
		const posthog = getPostHogServer();
		if (!posthog) {
			return;
		}

		const distinctId = typeof extra?.id === "string" ? extra.id : undefined;
		posthog.captureException(exception, distinctId, extra);
	},
	initialize: () => {
		getPostHogServer();
	},
	onRequestError: (
		error: unknown,
		request: Readonly<{
			path: string;
			method: string;
			headers: NodeJS.Dict<string | string[]>;
		}>,
	) => {
		/* eslint-disable-next-line turbo/no-undeclared-env-vars, no-restricted-properties */
		if (process.env.NEXT_RUNTIME !== "nodejs") {
			return;
		}

		const posthog = getPostHogServer();
		if (!posthog) {
			return;
		}

		let distinctId: string | undefined;
		if (request.headers.cookie) {
			const cookieString = Array.isArray(request.headers.cookie)
				? request.headers.cookie.join("; ")
				: request.headers.cookie;

			const postHogCookieMatch = /ph_phc_.*?_posthog=([^;]+)/.exec(
				cookieString,
			);

			if (postHogCookieMatch?.[1]) {
				try {
					const decodedCookie = decodeURIComponent(
						postHogCookieMatch[1],
					);
					const data: unknown = JSON.parse(decodedCookie);

					if (
						typeof data === "object" &&
						data !== null &&
						"distinct_id" in data &&
						typeof data.distinct_id === "string"
					) {
						distinctId = data.distinct_id;
					}
				} catch {
					/*  Ignore */
				}
			}
		}

		posthog.captureException(error, distinctId);
	},
};
