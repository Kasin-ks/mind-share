import { Button } from "@ui/components/button";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function ClosingSection() {
	const t = await getTranslations("marketing.closing");

	return (
		<section className="border-border/70 border-t">
			<div className="container py-32 text-center lg:py-44">
				<h2 className="display-lg mx-auto max-w-[20ch] text-foreground">
					{t("title")}
				</h2>
				<p className="body-lg mx-auto mt-6 max-w-[52ch] text-muted-foreground">
					{t("body")}
				</p>
				<div className="mt-12 flex justify-center">
					<Button size="lg" variant="primary" asChild>
						<Link href="/auth/signup">
							{t("cta")}
							<ArrowRightIcon className="ml-1 size-4" />
						</Link>
					</Button>
				</div>
			</div>
		</section>
	);
}
