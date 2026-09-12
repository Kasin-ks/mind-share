import { config } from "@repo/config";
import { cn } from "@ui/lib";
import Image from "next/image";
import logoMark from "../../../public/images/mind-share-mark.png";

export function Logo({
	withLabel = true,
	className,
}: {
	className?: string;
	withLabel?: boolean;
}) {
	return (
		<span
			className={cn(
				"flex items-center gap-2.5 font-medium text-foreground leading-none",
				className,
			)}
		>
			<Image
				src={logoMark}
				alt=""
				width={32}
				height={32}
				className="size-8 rounded-lg border border-border/60 bg-black object-cover"
				priority
			/>
			{withLabel && (
				<span className="text-base tracking-[-0.02em]">
					{config.appName}
				</span>
			)}
		</span>
	);
}
