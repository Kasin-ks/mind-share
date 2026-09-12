import * as Sentry from "@sentry/nextjs";

import { sentryDsn, sentryEnvironment } from "./config";

// Server-side exports
export const server = {
	captureException: (exception: unknown) => {
		Sentry.captureException(exception);
	},
	initialize: () => {
		if (!sentryDsn) {
			return;
		}

		Sentry.init({
			dsn: sentryDsn,
			environment: sentryEnvironment,

			// Adds more context data to events (IP address, cookies, user, etc.)
			// For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
			sendDefaultPii: true,

			// Note: if you want to override the automatic release value, do not set a
			// `release` value here - use the environment variable `SENTRY_RELEASE`, so
			// that it will also get attached to your source maps,
		});
	},
	onRequestError: Sentry.captureRequestError,
};

