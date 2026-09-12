import { config } from "@repo/config";
import { ContextUniverse } from "@shared/components/ContextUniverse";
import { LocaleSwitch } from "@shared/components/LocaleSwitch";
import { Logo } from "@shared/components/Logo";
import { cn } from "@ui/lib";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { type PropsWithChildren, Suspense } from "react";

export async function AuthWrapper({
	children,
	contentClass,
}: PropsWithChildren<{ contentClass?: string }>) {
	const t = await getTranslations("marketing");

	return (
		// Authentication shares the marketing canvas: committed dark, no
		// color-mode toggle until the user is inside the app.
		<div className="dark min-h-screen bg-background text-foreground lg:grid lg:grid-cols-2">
			<aside className="relative hidden overflow-hidden border-border/70 border-r lg:flex lg:flex-col lg:justify-between">
				<div className="absolute inset-0" aria-hidden>
					<div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_45%,#132431_0%,#060f15_48%,transparent_80%)]" />
					<ContextUniverse
						opacity={0.5}
						className="[mask-image:radial-gradient(75%_65%_at_50%_45%,black,transparent)]"
					/>
				</div>

				<div className="relative p-12">
					<Link href="/" className="inline-block">
						<Logo />
					</Link>
				</div>

				<div className="relative p-12">
					<p className="eyebrow text-muted-foreground">
						{t("hero.eyebrow")}
					</p>
					<p className="display-md mt-6 max-w-[22ch] text-foreground">
						{t("statement.title")}
					</p>
					<p className="mt-6 max-w-[44ch] text-muted-foreground text-sm leading-relaxed">
						{t("footer.tagline")}
					</p>
				</div>
			</aside>

			<div className="flex min-h-screen flex-col">
				<div className="flex items-center justify-between px-6 py-6 lg:px-12">
					<Link href="/" className="block lg:invisible">
						<Logo />
					</Link>

					{config.i18n.enabled && (
						<Suspense>
							<LocaleSwitch withLocaleInUrl={false} />
						</Suspense>
					)}
				</div>

				<div className="flex flex-1 items-center justify-center px-6 py-12 lg:px-12">
					<main className={cn("w-full max-w-sm", contentClass)}>
						{children}
					</main>
				</div>

				<div className="px-6 py-6 text-muted-foreground text-xs lg:px-12">
					© {new Date().getFullYear()} {config.appName}
				</div>
			</div>
		</div>
	);
}
