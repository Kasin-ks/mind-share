import { cn } from "@ui/lib";
import styles from "./context-universe.module.css";

// The drifting starfield behind the Context Map, reused as the marketing and
// auth backdrop. Deterministic by construction — the same 650 motes every
// render, so it is safe in a server component and never counts as context data.
const DUST = Array.from({ length: 650 }, (_, i) => {
	const radius = 14 + Math.sqrt(i / 650) * 420;
	const angle = i * 2.39996;
	const spiral = radius * 0.014 + ((i % 3) * Math.PI * 2) / 3;
	const scatter = Math.sin(angle * 13) * 35;
	return {
		id: i,
		x: 500 + Math.cos(spiral) * (radius + scatter),
		y: 350 + Math.sin(spiral) * (radius + scatter) * 0.64,
		radius: i % 19 === 0 ? 2.1 : 0.5 + (i % 5) * 0.18,
		color: i % 7 === 0 ? "#f4ba8b" : "#9bd5ff",
		opacity: 0.2 + (i % 9) * 0.085,
	};
});

export function ContextUniverse({
	className,
	opacity = 0.65,
	speed = "ambient",
	glow = false,
}: {
	className?: string;
	opacity?: number;
	/** "active" spins five times faster, for the live extraction state. */
	speed?: "ambient" | "active";
	glow?: boolean;
}) {
	return (
		<svg
			className={cn(
				styles.dust,
				speed === "active" && styles.active,
				glow && styles.glow,
				className,
			)}
			style={{ opacity }}
			viewBox="0 0 1000 700"
			preserveAspectRatio="xMidYMid slice"
			aria-hidden="true"
		>
			<g>
				{DUST.map((mote) => (
					<circle
						key={mote.id}
						cx={mote.x}
						cy={mote.y}
						r={mote.radius}
						fill={mote.color}
						opacity={mote.opacity}
					/>
				))}
			</g>
		</svg>
	);
}
