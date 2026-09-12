import { config } from "@repo/config";
import { NavBar } from "@saas/shared/components/NavBar";
import { cn } from "@ui/lib";
import type { PropsWithChildren } from "react";

export function AppWrapper({ children }: PropsWithChildren) {
	return (
		<div className="min-h-screen bg-background">
			<NavBar />
			<div
				className={cn("flex", [
					config.ui.saas.useSidebarLayout
						? "min-h-screen md:ml-[280px]"
						: "",
				])}
			>
				<main className="w-full px-6 py-10 md:px-10 lg:px-14 lg:py-14">
					<div className="mx-auto w-full max-w-5xl">{children}</div>
				</main>
			</div>
		</div>
	);
}
