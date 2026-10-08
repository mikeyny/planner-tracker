import { formatClock } from "@deep/shared";
import { cx } from "./ui";

/**
 * Time Timer-style disc: the coloured wedge is the time left and shrinks clockwise.
 * Open-ended sessions show elapsed time with a breathing ring instead.
 */
export function Disc({
	progress,
	seconds,
	color,
	label,
	size = 260,
	paused,
	overtime,
}: {
	/** 1 → 0, or null for open-ended */
	progress: number | null;
	seconds: number;
	color: string;
	label: string;
	size?: number;
	paused?: boolean;
	overtime?: boolean;
}) {
	const open = progress === null;
	const fill = open ? 1 : progress;
	return (
		<div
			className="relative shrink-0 rounded-full"
			style={{
				width: size,
				height: size,
				maxWidth: "100%",
				background: `conic-gradient(${color} ${fill}turn, #24222a 0)`,
				boxShadow: paused
					? "none"
					: `0 0 70px -12px color-mix(in srgb, ${color} 55%, transparent)`,
				transition: "background 0.9s linear",
			}}
		>
			<div
				className="absolute -inset-[7px] rounded-full"
				style={{
					background:
						"repeating-conic-gradient(from -0.5deg, #45424d 0 1deg, transparent 1deg 30deg)",
					mask: "radial-gradient(circle, transparent 67%, #000 68%, #000 71%, transparent 72%)",
				}}
			/>
			<div
				className={cx(
					"absolute inset-[13%] rounded-full bg-bg",
					open && !paused && "animate-breathe",
				)}
				style={open ? { boxShadow: `inset 0 0 0 2px ${color}` } : undefined}
			/>
			<div className="absolute inset-0 grid place-items-center">
				<div className="flex flex-col items-center">
					<span
						className={cx(
							"font-mono font-medium tabular",
							overtime ? "text-warn" : paused ? "text-muted" : "text-fg",
						)}
						style={{ fontSize: Math.round(size * 0.135) }}
					>
						{formatClock(seconds)}
					</span>
					<span className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
						{paused ? "paused" : label}
					</span>
				</div>
			</div>
		</div>
	);
}
