import { LocaleLink } from "@i18n/routing";
import { ContextUniverse } from "@shared/components/ContextUniverse";
import { Button } from "@ui/components/button";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function Hero() {
	const t = await getTranslations("marketing.hero");

	return (
		<section className="relative isolate overflow-hidden">
			{/* Same drifting universe the Context Map runs on, faded back so the
			    headline keeps the contrast. */}
			<div
				className="-z-10 pointer-events-none absolute inset-0"
				aria-hidden
			>
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_62%_42%,#132431_0%,#060f15_45%,transparent_78%)]" />
				<ContextUniverse
					opacity={0.55}
					className="[mask-image:radial-gradient(65%_55%_at_62%_42%,black,transparent)]"
				/>
			</div>

			<div className="container flex min-h-[92vh] flex-col justify-center pt-40 pb-24 lg:pb-32">
				<p className="eyebrow text-muted-foreground">{t("eyebrow")}</p>

				<h1 className="display-hero mt-8 max-w-[15ch] text-foreground">
					{t("title")}
				</h1>

				<p className="body-lg mt-8 max-w-[62ch] text-muted-foreground">
					{t("subtitle")}
				</p>

				<div className="mt-12 flex flex-wrap items-center gap-3">
					<Button size="lg" variant="primary" asChild>
						<Link href="/auth/login">
							{t("primaryCta")}
							<ArrowRightIcon className="ml-1 size-4" />
						</Link>
					</Button>
					<Button size="lg" variant="outline" asChild>
						<LocaleLink href="/#protocol">
							{t("secondaryCta")}
						</LocaleLink>
					</Button>
				</div>
			</div>
		</section>
	);
}
