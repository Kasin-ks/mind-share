import { createMDXSource } from "@fumadocs/content-collections";
import { config } from "@repo/config";
import { allDocs, allDocsMetas } from "content-collections";
import { loader } from "fumadocs-core/source";
import { Home } from "lucide-react";
import { createElement } from "react";

/** Docs-only languages supported by the search tokenizer (e.g. Orama). */
const DOCS_LANGUAGES = ["en"] as const;

/** Map app locale to a docs language supported by the search tokenizer. */
export function getDocsLanguage(locale: string): string {
	if (DOCS_LANGUAGES.includes(locale as (typeof DOCS_LANGUAGES)[number])) {
		return locale;
	}
	return "en";
}

export const docsSource = loader({
	baseUrl: "/docs",
	i18n: {
		defaultLanguage: config.i18n.defaultLocale,
		languages: [...DOCS_LANGUAGES],
	},
	source: createMDXSource(allDocs, allDocsMetas),
	icon(icon) {
		if (!icon) {
			return;
		}

		const icons = {
			Home,
		};

		if (icon in icons) {
			return createElement(icons[icon as keyof typeof icons]);
		}
	},
});
