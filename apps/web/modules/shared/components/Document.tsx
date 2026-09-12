import type { PropsWithChildren } from "react";

export function Document({
	children,
	locale: _locale,
}: PropsWithChildren<{ locale: string }>) {
	// Document is now just a wrapper since html/body are in root layout
	// The locale prop is kept for backwards compatibility but not used for lang attribute
	return <>{children}</>;
}
