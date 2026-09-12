/* eslint-disable turbo/no-undeclared-env-vars */
export const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN as string;
export const sentryEnvironment =
	(process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT as string) ||
	process.env.NODE_ENV;
