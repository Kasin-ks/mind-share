/* eslint-disable turbo/no-undeclared-env-vars */
export const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY as string;
export const posthogHost =
	(process.env.NEXT_PUBLIC_POSTHOG_HOST as string) ||
	"https://us.i.posthog.com";
