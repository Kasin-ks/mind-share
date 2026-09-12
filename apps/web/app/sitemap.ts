import { config } from "@repo/config";
import { getBaseUrl } from "@repo/utils";
import { allLegalPages } from "content-collections";
import type { MetadataRoute } from "next";
import { docsSource, getDocsLanguage } from "./docs-source";

const baseUrl = getBaseUrl();
const locales = config.i18n.enabled
	? Object.keys(config.i18n.locales)
	: [config.i18n.defaultLocale];

const staticMarketingPages = [""];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	return [
		...staticMarketingPages.flatMap((page) =>
			locales.map((locale) => ({
				url: new URL(`/${locale}${page}`, baseUrl).href,
				lastModified: new Date(),
			})),
		),
		...allLegalPages.map((page) => ({
			url: new URL(`/${page.locale}/legal/${page.path}`, baseUrl).href,
			lastModified: new Date(),
		})),
		...docsSource.getLanguages().flatMap((locale) => {
			const pages = docsSource.getPages(locale.language).map((page) => ({
				url: new URL(
					`/${locale.language}/docs/${page.slugs.join("/")}`,
					baseUrl,
				).href,
				lastModified: new Date(),
			}));
			const appLocales = config.i18n.enabled
				? Object.keys(config.i18n.locales)
				: [config.i18n.defaultLocale];
			const aliasedLocales = appLocales.filter(
				(l) => getDocsLanguage(l) === locale.language && l !== locale.language,
			);
			const aliasUrls = aliasedLocales.flatMap((loc) =>
				docsSource.getPages(locale.language).map((page) => ({
					url: new URL(
						`/${loc}/docs/${page.slugs.join("/")}`,
						baseUrl,
					).href,
					lastModified: new Date(),
				})),
			);
			return [...pages, ...aliasUrls];
		}),
	];
}
