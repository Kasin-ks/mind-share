import { cn } from "@ui/lib";
import { getTranslations } from "next-intl/server";

const items = ["access", "map", "inference", "agents"] as const;

export async function FaqSection({ className }: { className?: string }) {
	const t = await getTranslations();

	return (
		<section
			id="faq"
			className={cn("scroll-mt-24 border-border/70 border-t", className)}
		>
			<div className="container grid gap-16 py-28 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-24 lg:py-40">
				<div className="lg:sticky lg:top-28 lg:self-start">
					<h2 className="display-lg text-foreground">
						{t("faq.title")}
					</h2>
					<p className="body-lg mt-6 text-muted-foreground">
						{t("faq.description")}
					</p>
				</div>

				<dl>
					{items.map((item) => (
						<div
							key={item}
							className="border-border/70 border-t py-8 first:border-t-0 first:pt-0"
						>
							<dt className="display-md text-foreground">
								{t(`marketing.faq.items.${item}.question`)}
							</dt>
							<dd className="mt-4 max-w-[62ch] text-[0.9375rem] text-muted-foreground leading-relaxed">
								{t(`marketing.faq.items.${item}.answer`)}
							</dd>
						</div>
					))}
				</dl>
			</div>
		</section>
	);
}
