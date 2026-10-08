import type { CSSProperties, ReactNode } from "react";
import {
	AbsoluteFill,
	Easing,
	Img,
	interpolate,
	spring,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import { C, F } from "./theme";

/** 0→1 over [start, end] seconds, eased. */
export function useProgress(start: number, end: number) {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	return interpolate(frame, [start * fps, end * fps], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: Easing.bezier(0.22, 1, 0.36, 1),
	});
}

/** Spring-in from a delay (seconds). */
export function useEnter(delay = 0, damping = 200) {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	return spring({ frame: frame - delay * fps, fps, config: { damping } });
}

/** Scene progress 0→1 across its whole duration. */
export function useSceneT() {
	const frame = useCurrentFrame();
	const { durationInFrames } = useVideoConfig();
	return frame / durationInFrames;
}

export function Background({ accent = C.smp }: { accent?: string }) {
	const frame = useCurrentFrame();
	const drift = Math.sin(frame / 90) * 40;
	return (
		<AbsoluteFill style={{ background: C.bg }}>
			<AbsoluteFill
				style={{
					background: `radial-gradient(900px 600px at ${70 + drift / 20}% ${-5 + drift / 30}%, ${accent}22, transparent 70%), radial-gradient(700px 500px at 10% 110%, ${C.rose}14, transparent 70%)`,
				}}
			/>
		</AbsoluteFill>
	);
}

/** Small uppercase label + big title, top-left. */
export function SceneTitle({
	kicker,
	title,
	color = C.fg,
}: {
	kicker: string;
	title: string;
	color?: string;
}) {
	const t = useEnter(0.1);
	return (
		<div
			style={{
				position: "absolute",
				left: 96,
				top: 52,
				opacity: t,
				transform: `translateY(${(1 - t) * 18}px)`,
			}}
		>
			<div
				style={{
					fontFamily: F.mono,
					fontSize: 18,
					letterSpacing: 2,
					textTransform: "uppercase",
					color: C.rose,
				}}
			>
				{kicker}
			</div>
			<div
				style={{
					fontFamily: F.display,
					fontWeight: 800,
					fontSize: 52,
					letterSpacing: -1.2,
					color,
					marginTop: 6,
				}}
			>
				{title}
			</div>
		</div>
	);
}

export interface Mark {
	/** Box in screenshot pixels. */
	x: number;
	y: number;
	w: number;
	h: number;
	/** When it shows, as a fraction of the scene (0–1). */
	from: number;
	to?: number;
	label?: string;
	/** Where the label sits relative to the box. */
	side?: "top" | "bottom" | "left" | "right";
}

/**
 * A real app screenshot in a window frame, with timed spotlights.
 * Coordinates for marks are in the screenshot's own pixels.
 */
export function AppShot({
	src,
	width = 1320,
	height = 860,
	displayWidth = 1400,
	marks = [],
	top = 168,
	left,
	zoom = 1.035,
	style,
}: {
	src: string;
	width?: number;
	height?: number;
	displayWidth?: number;
	marks?: Mark[];
	top?: number;
	left?: number;
	zoom?: number;
	style?: CSSProperties;
}) {
	const frame = useCurrentFrame();
	const { durationInFrames, fps } = useVideoConfig();
	const scale = displayWidth / width;
	const displayHeight = height * scale;
	const enter = spring({ frame, fps, config: { damping: 200 } });
	const z = interpolate(frame, [0, durationInFrames], [1, zoom]);
	const t = frame / durationInFrames;
	const x0 = left ?? (1920 - displayWidth) / 2;
	const anyMark = marks.some((m) => t >= m.from && t <= (m.to ?? 1));

	return (
		<div
			style={{
				position: "absolute",
				left: x0,
				top,
				width: displayWidth,
				height: displayHeight,
				borderRadius: 18,
				overflow: "hidden",
				border: `1px solid ${C.lineStrong}`,
				boxShadow:
					"0 40px 90px -30px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.03) inset",
				opacity: enter,
				transform: `translateY(${(1 - enter) * 30}px)`,
				...style,
			}}
		>
			<div
				style={{
					position: "absolute",
					inset: 0,
					transform: `scale(${z})`,
					transformOrigin: "50% 40%",
				}}
			>
				<Img
					src={staticFile(src)}
					style={{
						width: displayWidth,
						height: displayHeight,
						display: "block",
					}}
				/>
				{/* Dim everything except the active spotlight. */}
				{marks.map((m, i) => {
					const visible = t >= m.from && t <= (m.to ?? 1);
					const local = visible
						? interpolate(
								frame,
								[m.from * durationInFrames, m.from * durationInFrames + 10],
								[0, 1],
								{
									extrapolateRight: "clamp",
								},
							)
						: 0;
					return (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: static list of marks
							key={i}
							style={{
								position: "absolute",
								left: m.x * scale - 6,
								top: m.y * scale - 6,
								width: m.w * scale + 12,
								height: m.h * scale + 12,
								borderRadius: 12,
								border: `2.5px solid ${C.rose}`,
								boxShadow:
									anyMark && visible
										? `0 0 0 9999px rgba(8,7,10,${0.5 * local}), 0 0 30px ${C.rose}66`
										: "none",
								opacity: local,
								transform: `scale(${1.04 - 0.04 * local})`,
							}}
						>
							{m.label && (
								<MarkLabel text={m.label} side={m.side ?? "bottom"} />
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function MarkLabel({
	text,
	side,
}: {
	text: string;
	side: "top" | "bottom" | "left" | "right";
}) {
	const pos: CSSProperties =
		side === "bottom"
			? { top: "100%", left: 0, marginTop: 12 }
			: side === "top"
				? { bottom: "100%", left: 0, marginBottom: 12 }
				: side === "left"
					? { right: "100%", top: 0, marginRight: 14 }
					: { left: "100%", top: 0, marginLeft: 14 };
	return (
		<div
			style={{
				position: "absolute",
				...pos,
				whiteSpace: "nowrap",
				background: C.rose,
				color: "white",
				fontFamily: F.sans,
				fontWeight: 600,
				fontSize: 22,
				padding: "8px 14px",
				borderRadius: 10,
				boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
			}}
		>
			{text}
		</div>
	);
}

/** The narration is written to be spoken; subtitles show it the way you'd type it. */
function captionText(text: string) {
	return text
		.replace(/bun run db up/g, "bun run db:up")
		.replace(/bun run install vscode/g, "bun run install:vscode")
		.replace(/the dot env file/g, "the .env file")
		.replace(/A\.I\./g, "AI")
		.replace(/control, shift, space/gi, "Ctrl+Shift+Space")
		.replace(/control K/g, "Ctrl+K")
		.replace(/Fifty, ten/g, "50/10")
		.replace(/Ninety minutes/g, "90 minutes")
		.replace(/twenty five minutes/g, "25 minutes")
		.replace(/start fifty minutes/g, "“start 50 minutes")
		.replace(/hero section, and it just/g, "hero section”, and it just")
		.replace(/Just five minutes/g, "Just 5 minutes")
		.replace(/ten minutes/g, "10 minutes")
		.replace(/at two'/g, "at 2'");
}

/** Subtitles: the narration split into sentences, timed by length. */
export function Captions({ text, seconds }: { text: string; seconds: number }) {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	// Split only where a new sentence starts, so "A.I. features" stays whole.
	const parts = captionText(text)
		.split(/(?<=[.!?])\s+(?=[A-Z"'“])/)
		.map((s) => s.trim())
		.filter(Boolean);
	const total = parts.reduce((a, p) => a + p.length, 0);
	const now = frame / fps - 0.2;
	let acc = 0;
	let current = parts[0]!;
	for (const p of parts) {
		const start = (acc / total) * seconds;
		acc += p.length;
		if (now >= start) current = p;
	}
	if (now > seconds + 0.4) return null;
	return (
		<div
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: 34,
				display: "flex",
				justifyContent: "center",
			}}
		>
			<div
				style={{
					maxWidth: 1300,
					textAlign: "center",
					fontFamily: F.sans,
					fontWeight: 500,
					fontSize: 30,
					lineHeight: 1.35,
					color: C.fg,
					background: "rgba(10,9,13,0.82)",
					border: `1px solid ${C.line}`,
					padding: "12px 26px",
					borderRadius: 14,
				}}
			>
				{current}
			</div>
		</div>
	);
}

export function Keycap({
	children,
	big,
}: {
	children: ReactNode;
	big?: boolean;
}) {
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				minWidth: big ? 74 : 44,
				height: big ? 74 : 44,
				padding: big ? "0 22px" : "0 12px",
				borderRadius: big ? 16 : 10,
				border: `1.5px solid ${C.lineStrong}`,
				borderBottomWidth: big ? 6 : 4,
				background: C.raised,
				fontFamily: F.mono,
				fontSize: big ? 30 : 20,
				color: C.fg,
			}}
		>
			{children}
		</span>
	);
}

/** Deep's logo mark: a timer disc. `fill` is the wedge left, 0–1. */
export function LogoDisc({
	size,
	fill,
	color = C.smp,
}: {
	size: number;
	fill: number;
	color?: string;
}) {
	return (
		<div
			style={{
				width: size,
				height: size,
				borderRadius: "50%",
				background: `conic-gradient(${color} ${fill}turn, #26232c 0)`,
				position: "relative",
				boxShadow: `0 0 ${size / 2}px -${size / 6}px ${color}88`,
			}}
		>
			<div
				style={{
					position: "absolute",
					inset: "21%",
					borderRadius: "50%",
					background: C.bg,
				}}
			/>
			<div
				style={{
					position: "absolute",
					inset: "45%",
					borderRadius: "50%",
					background: C.fg,
				}}
			/>
		</div>
	);
}
