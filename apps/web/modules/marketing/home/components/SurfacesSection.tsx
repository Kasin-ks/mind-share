import { ScrollTextIcon, SparklesIcon, UsersRoundIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

const surfaces = [
	{ id: "ask", icon: UsersRoundIcon },
	{ id: "context", icon: SparklesIcon },
	{ id: "audit", icon: ScrollTextIcon },
] as const;

export async function SurfacesSection() {
	const t = await getTranslations("marketing.surfaces");

	return (
		<section className="border-border/70 border-t">
			<div className="container py-28 lg:py-40">
				<p className="eyebrow text-muted-foreground">{t("eyebrow")}</p>
				<h2 className="display-lg mt-6 max-w-[18ch] text-foreground">
					{t("title")}
				</h2>
				<p className="body-lg mt-6 max-w-[56ch] text-muted-foreground">
					{t("description")}
				</p>

				<div className="mt-20 grid gap-4 md:grid-cols-3">
					{surfaces.map((surface) => (
						<article
							key={surface.id}
							className="rounded-2xl border border-border bg-card/60 p-8 lg:p-10"
						>
							<surface.icon
								className="size-5 text-muted-foreground"
								aria-hidden
							/>
							<h3 className="display-md mt-8 text-foreground">
								{t(`items.${surface.id}.title`)}
							</h3>
							<p className="mt-4 text-[0.9375rem] text-muted-foreground leading-relaxed">
								{t(`items.${surface.id}.body`)}
							</p>
						</article>
					))}
				</div>
			</div>
		</section>
	);
}
