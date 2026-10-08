import type { ReactNode } from "react";
import {
	AbsoluteFill,
	Img,
	interpolate,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import {
	AppShot,
	Background,
	Keycap,
	LogoDisc,
	SceneTitle,
	useEnter,
	useProgress,
	useSceneT,
} from "./components";
import type { SceneId } from "./script";
import { C, F } from "./theme";

const SHOT = { displayWidth: 1340, top: 158 };

/* ------------------------------------------------------------------ */

function Intro() {
	const frame = useCurrentFrame();
	const { durationInFrames } = useVideoConfig();
	const fill = interpolate(frame, [0, durationInFrames], [0.95, 0.55]);
	const a = useEnter(0.2);
	const b = useEnter(0.9);
	const c = useEnter(2.2);
	return (
		<AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
			<Background />
			<div
				style={{
					position: "relative",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: 36,
					marginTop: -60,
				}}
			>
				<div style={{ opacity: a, transform: `scale(${0.8 + 0.2 * a})` }}>
					<LogoDisc size={210} fill={fill} />
				</div>
				<div
					style={{
						fontFamily: F.display,
						fontWeight: 800,
						fontSize: 132,
						letterSpacing: -4,
						color: C.fg,
						opacity: b,
						transform: `translateY(${(1 - b) * 20}px)`,
					}}
				>
					Deep
				</div>
				<div
					style={{
						fontFamily: F.sans,
						fontSize: 40,
						color: C.muted,
						opacity: c,
						maxWidth: 1100,
						textAlign: "center",
						lineHeight: 1.3,
					}}
				>
					Make the next focused hour the easiest thing to start.
				</div>
			</div>
		</AbsoluteFill>
	);
}

const LOOP = [
	["Capture", "Get it out of your head"],
	["Choose", "Three big rocks"],
	["Commit", "Give them real hours"],
	["Focus", "One thing at a time"],
	["Close", "Where I left off"],
	["Reflect", "Learn your patterns"],
];

function Loop() {
	const t = useSceneT();
	return (
		<AbsoluteFill>
			<Background accent={C.rose} />
			<SceneTitle kicker="The idea" title="One loop, every day" />
			<div
				style={{
					position: "absolute",
					left: 96,
					right: 96,
					top: 300,
					display: "grid",
					gridTemplateColumns: "repeat(6, 1fr)",
					gap: 20,
				}}
			>
				{LOOP.map(([v, d], i) => {
					const start = 0.1 + i * 0.12;
					const on = interpolate(t, [start, start + 0.05], [0, 1], {
						extrapolateLeft: "clamp",
						extrapolateRight: "clamp",
					});
					const active = t >= start && t < start + 0.12;
					return (
						<div
							key={v}
							style={{
								opacity: 0.25 + 0.75 * on,
								transform: `translateY(${(1 - on) * 24}px)`,
								background: active ? C.raised : C.surface,
								border: `1.5px solid ${active ? C.rose : C.line}`,
								borderRadius: 22,
								padding: "34px 26px",
								height: 300,
								display: "flex",
								flexDirection: "column",
								gap: 16,
							}}
						>
							<span style={{ fontFamily: F.mono, fontSize: 22, color: C.rose }}>
								{i + 1}
							</span>
							<span
								style={{
									fontFamily: F.display,
									fontWeight: 800,
									fontSize: 44,
									color: C.fg,
								}}
							>
								{v}
							</span>
							<span
								style={{
									fontFamily: F.sans,
									fontSize: 26,
									color: C.muted,
									lineHeight: 1.35,
								}}
							>
								{d}
							</span>
						</div>
					);
				})}
			</div>
			<div
				style={{
					position: "absolute",
					left: 96,
					top: 650,
					fontFamily: F.sans,
					fontSize: 28,
					color: C.muted,
					opacity: interpolate(t, [0.82, 0.88], [0, 1], {
						extrapolateLeft: "clamp",
						extrapolateRight: "clamp",
					}),
				}}
			>
				Step 6 feeds tomorrow's step 1 →
			</div>
		</AbsoluteFill>
	);
}

const SETUP = [
	{ at: 0.12, cmd: "bun run db:up", note: "Postgres in Docker" },
	{ at: 0.3, cmd: "bun run app", note: "Opens Deep and its local server" },
	{
		at: 0.55,
		cmd: "GEMINI_API_KEY=…   # in .env",
		note: "Optional AI features",
	},
	{ at: 0.75, cmd: "bun run install:vscode", note: "Editor extension" },
];

function Setup() {
	const t = useSceneT();
	return (
		<AbsoluteFill>
			<Background />
			<SceneTitle kicker="Setup" title="Running in a minute" />
			<div
				style={{
					position: "absolute",
					left: 260,
					right: 260,
					top: 250,
					background: "#0b0a0e",
					border: `1px solid ${C.lineStrong}`,
					borderRadius: 20,
					overflow: "hidden",
					boxShadow: "0 40px 90px -30px rgba(0,0,0,0.8)",
				}}
			>
				<div
					style={{
						display: "flex",
						gap: 10,
						padding: "16px 20px",
						borderBottom: `1px solid ${C.line}`,
						background: C.surface,
					}}
				>
					{[0, 1, 2].map((i) => (
						<span
							key={i}
							style={{
								width: 14,
								height: 14,
								borderRadius: 7,
								background: "#3a3742",
							}}
						/>
					))}
					<span
						style={{
							marginLeft: 16,
							fontFamily: F.mono,
							fontSize: 18,
							color: C.muted,
						}}
					>
						planner-tracker
					</span>
				</div>
				<div
					style={{
						padding: "30px 36px",
						display: "flex",
						flexDirection: "column",
						gap: 26,
					}}
				>
					{SETUP.map((s) => {
						const typed = interpolate(
							t,
							[s.at, s.at + 0.08],
							[0, s.cmd.length],
							{
								extrapolateLeft: "clamp",
								extrapolateRight: "clamp",
							},
						);
						const done = t > s.at + 0.1;
						return (
							<div
								key={s.cmd}
								style={{
									display: "flex",
									alignItems: "baseline",
									gap: 18,
									opacity: t >= s.at ? 1 : 0.15,
								}}
							>
								<span
									style={{ fontFamily: F.mono, fontSize: 30, color: C.rose }}
								>
									›
								</span>
								<span
									style={{
										fontFamily: F.mono,
										fontSize: 30,
										color: C.fg,
										minWidth: 640,
									}}
								>
									{s.cmd.slice(0, Math.round(typed))}
									{t >= s.at && !done && (
										<span style={{ color: C.rose }}>▍</span>
									)}
								</span>
								<span
									style={{
										fontFamily: F.sans,
										fontSize: 24,
										color: done ? C.good : C.faint,
									}}
								>
									{done ? `✓ ${s.note}` : ""}
								</span>
							</div>
						);
					})}
				</div>
			</div>
		</AbsoluteFill>
	);
}

/* Timer modes drawn to scale on a 0–120 minute axis. */
const MODES: { name: string; hint: string; parts: [string, number][] }[] = [
	{
		name: "Pomodoro",
		hint: "for tasks you're avoiding",
		parts: [
			["w", 25],
			["b", 5],
			["w", 25],
			["b", 5],
			["w", 25],
			["b", 5],
			["w", 25],
		],
	},
	{
		name: "Deep 50/10",
		hint: "normal deep work",
		parts: [
			["w", 50],
			["b", 10],
			["w", 50],
			["b", 10],
		],
	},
	{
		name: "Deep 90/20",
		hint: "hard problems",
		parts: [
			["w", 90],
			["b", 20],
		],
	},
	{
		name: "Flowtime",
		hint: "no bell · break = work ÷ 5",
		parts: [
			["w", 70],
			["b", 14],
			["o", 34],
		],
	},
	{
		name: "Just 5 min",
		hint: "when starting is hardest",
		parts: [
			["w", 5],
			["k", 1],
			["o", 50],
		],
	},
];

function Timers() {
	const t = useSceneT();
	const W = 1180;
	return (
		<AbsoluteFill>
			<Background />
			<SceneTitle kicker="Focus" title="Different work, different timers" />
			<div
				style={{
					position: "absolute",
					left: 96,
					top: 250,
					display: "flex",
					flexDirection: "column",
					gap: 34,
				}}
			>
				{MODES.map((m, i) => {
					const start = 0.12 + i * 0.15;
					const grow = interpolate(t, [start, start + 0.08], [0, 1], {
						extrapolateLeft: "clamp",
						extrapolateRight: "clamp",
					});
					return (
						<div
							key={m.name}
							style={{
								display: "grid",
								gridTemplateColumns: "260px 1fr",
								alignItems: "center",
								gap: 24,
								opacity: 0.2 + 0.8 * grow,
							}}
						>
							<div>
								<div
									style={{
										fontFamily: F.display,
										fontWeight: 700,
										fontSize: 32,
										color: C.fg,
									}}
								>
									{m.name}
								</div>
								<div
									style={{
										fontFamily: F.sans,
										fontSize: 21,
										color: C.muted,
										marginTop: 4,
									}}
								>
									{m.hint}
								</div>
							</div>
							<div
								style={{
									display: "flex",
									gap: 4,
									height: 34,
									width: W * grow,
									overflow: "hidden",
								}}
							>
								{m.parts.map(([k, min], j) => (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: fixed segments
										key={j}
										style={{
											flex: "none",
											width: (min / 120) * W - 4,
											borderRadius: 7,
											background:
												k === "w"
													? C.smp
													: k === "b"
														? "#3e3b46"
														: k === "k"
															? C.warn
															: `linear-gradient(90deg, ${C.smp}, transparent)`,
										}}
									/>
								))}
							</div>
						</div>
					);
				})}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "260px 1180px",
						gap: 24,
						fontFamily: F.mono,
						fontSize: 18,
						color: C.faint,
					}}
				>
					<span />
					<div style={{ display: "flex", justifyContent: "space-between" }}>
						{["0", "30", "60", "90", "120 min"].map((l) => (
							<span key={l}>{l}</span>
						))}
					</div>
				</div>
			</div>
		</AbsoluteFill>
	);
}

/* A plain dark editor, so the mini timer and capture have something to float over. */
function EditorBackdrop({
	children,
	status,
}: {
	children?: ReactNode;
	status?: ReactNode;
}) {
	const code = [
		[
			{ c: "#c586c0", t: "export async function " },
			{ c: "#dcdcaa", t: "verifySignature" },
			{ c: "#9cdcfe", t: "(raw: string, sig: string) {" },
		],
		[{ c: "#6a9955", t: "  // hash the raw body, not parsed JSON" }],
		[
			{ c: "#c586c0", t: "  const " },
			{ c: "#9cdcfe", t: "mac = " },
			{ c: "#dcdcaa", t: "createHmac" },
			{ c: "#ce9178", t: '("sha512", key)' },
		],
		[
			{ c: "#9cdcfe", t: "    ." },
			{ c: "#dcdcaa", t: "update" },
			{ c: "#9cdcfe", t: "(raw)." },
			{ c: "#dcdcaa", t: "digest" },
			{ c: "#ce9178", t: '("hex")' },
			{ c: "#9cdcfe", t: ";" },
		],
		[
			{ c: "#c586c0", t: "  return " },
			{ c: "#dcdcaa", t: "timingSafeEqual" },
			{ c: "#9cdcfe", t: "(mac, sig);" },
		],
		[{ c: "#9cdcfe", t: "}" }],
		[],
		[
			{ c: "#c586c0", t: "export async function " },
			{ c: "#dcdcaa", t: "handleCallback" },
			{ c: "#9cdcfe", t: "(req: Request) {" },
		],
		[
			{ c: "#c586c0", t: "  const " },
			{ c: "#9cdcfe", t: "raw = " },
			{ c: "#c586c0", t: "await " },
			{ c: "#9cdcfe", t: "req." },
			{ c: "#dcdcaa", t: "text" },
			{ c: "#9cdcfe", t: "();" },
		],
	];
	return (
		<div
			style={{
				position: "absolute",
				left: 150,
				right: 150,
				top: 190,
				bottom: 120,
				background: "#1e1e1e",
				borderRadius: 18,
				border: "1px solid #333",
				overflow: "hidden",
				boxShadow: "0 40px 90px -30px rgba(0,0,0,0.8)",
			}}
		>
			<div
				style={{
					background: "#2c2c2c",
					padding: "12px",
					textAlign: "center",
					fontFamily: F.mono,
					fontSize: 17,
					color: "#9a9a9a",
				}}
			>
				webhook.ts — smp — Visual Studio Code
			</div>
			<div
				style={{
					padding: "26px 34px",
					display: "flex",
					flexDirection: "column",
					gap: 10,
				}}
			>
				{code
					.map((parts, n) => ({ line: n + 1, parts }))
					.map(({ line, parts }) => (
						<div
							key={line}
							style={{
								fontFamily: F.mono,
								fontSize: 22,
								whiteSpace: "pre",
								height: 30,
							}}
						>
							<span style={{ color: "#5a5a5a", marginRight: 26 }}>
								{String(line).padStart(2, " ")}
							</span>
							{parts.map((p) => (
								<span key={p.t} style={{ color: p.c }}>
									{p.t}
								</span>
							))}
						</div>
					))}
			</div>
			<div
				style={{
					position: "absolute",
					left: 0,
					right: 0,
					bottom: 0,
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					background: "#181818",
					borderTop: "1px solid #2b2b2b",
					padding: "6px 16px",
					fontFamily: F.sans,
					fontSize: 18,
					color: "#c8c8c8",
				}}
			>
				<span>main ⟳</span>
				{status}
				<span>TypeScript</span>
			</div>
			{children}
		</div>
	);
}

function CaptureScene() {
	const t = useSceneT();
	const mini = interpolate(t, [0.05, 0.12], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const keys = interpolate(t, [0.38, 0.44], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const cap = interpolate(t, [0.5, 0.56], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const capOut = interpolate(t, [0.86, 0.9], [1, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	return (
		<AbsoluteFill>
			<Background />
			<SceneTitle kicker="Anywhere" title="Mini timer and quick capture" />
			<EditorBackdrop />
			<Img
				src={staticFile("shots/10-mini.png")}
				style={{
					position: "absolute",
					right: 186,
					top: 250,
					width: 510,
					borderRadius: 12,
					border: `1px solid ${C.lineStrong}`,
					boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
					opacity: mini,
					transform: `translateY(${(1 - mini) * -20}px)`,
				}}
			/>
			<div
				style={{
					position: "absolute",
					left: 0,
					right: 0,
					top: 470,
					display: "flex",
					justifyContent: "center",
					gap: 16,
					alignItems: "center",
					opacity: keys * (1 - cap),
				}}
			>
				<Keycap big>Ctrl</Keycap>
				<span style={{ fontFamily: F.mono, fontSize: 34, color: C.muted }}>
					+
				</span>
				<Keycap big>Shift</Keycap>
				<span style={{ fontFamily: F.mono, fontSize: 34, color: C.muted }}>
					+
				</span>
				<Keycap big>Space</Keycap>
			</div>
			<Img
				src={staticFile("shots/11-capture.png")}
				style={{
					position: "absolute",
					left: (1920 - 960) / 2,
					top: 440,
					width: 960,
					borderRadius: 14,
					border: `1px solid ${C.lineStrong}`,
					boxShadow: "0 40px 90px rgba(0,0,0,0.7)",
					opacity: cap * capOut,
					transform: `scale(${0.96 + 0.04 * cap})`,
				}}
			/>
		</AbsoluteFill>
	);
}

function Toast({ show }: { show: number }) {
	return (
		<div
			style={{
				position: "absolute",
				right: 26,
				bottom: 64,
				width: 560,
				background: "#252526",
				border: "1px solid #3c3c3c",
				borderRadius: 10,
				padding: "18px 20px",
				boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
				fontFamily: F.sans,
				fontSize: 22,
				color: "#d4d4d4",
				display: "flex",
				flexDirection: "column",
				gap: 14,
				opacity: show,
				transform: `translateY(${(1 - show) * 20}px)`,
			}}
		>
			<div>
				<b style={{ color: "#fff" }}>Deep</b>: you opened{" "}
				<b style={{ color: "#fff" }}>smp</b>. Start a focus session?
			</div>
			<div style={{ display: "flex", gap: 10 }}>
				<span
					style={{
						background: "#0e639c",
						color: "#fff",
						padding: "6px 14px",
						borderRadius: 4,
					}}
				>
					Start 50 min
				</span>
				<span
					style={{
						background: "#3a3d41",
						color: "#fff",
						padding: "6px 14px",
						borderRadius: 4,
					}}
				>
					Pick task…
				</span>
				<span
					style={{
						background: "#3a3d41",
						color: "#fff",
						padding: "6px 14px",
						borderRadius: 4,
					}}
				>
					Not now
				</span>
			</div>
		</div>
	);
}

function IdleCard({ show }: { show: number }) {
	const opt = (title: string, desc: string, sel?: boolean) => (
		<div
			style={{
				flex: 1,
				background: C.bg,
				border: `1.5px solid ${sel ? C.fg : C.line}`,
				borderRadius: 14,
				padding: "16px 18px",
				display: "flex",
				flexDirection: "column",
				gap: 6,
			}}
		>
			<b style={{ fontFamily: F.sans, fontSize: 24, color: C.fg }}>{title}</b>
			<span style={{ fontFamily: F.sans, fontSize: 19, color: C.muted }}>
				{desc}
			</span>
		</div>
	);
	return (
		<div
			style={{
				position: "absolute",
				left: (1920 - 900) / 2,
				top: 330,
				width: 900,
				background: C.surface,
				border: `1px solid ${C.lineStrong}`,
				borderRadius: 22,
				padding: 34,
				boxShadow: "0 50px 100px rgba(0,0,0,0.75)",
				opacity: show,
				transform: `scale(${0.95 + 0.05 * show})`,
				display: "flex",
				flexDirection: "column",
				gap: 22,
			}}
		>
			<div
				style={{
					fontFamily: F.display,
					fontWeight: 700,
					fontSize: 38,
					color: C.fg,
				}}
			>
				You were away for <span style={{ fontFamily: F.mono }}>12m</span>
			</div>
			<div style={{ fontFamily: F.sans, fontSize: 22, color: C.muted }}>
				No keyboard or mouse input since 10:41. The session paused itself.
			</div>
			<div style={{ display: "flex", gap: 14 }}>
				{opt("Keep", "I was thinking or sketching")}
				{opt("Count as break", "Doesn't add to focus time", true)}
				{opt("Discard", "Remove it from the log")}
			</div>
		</div>
	);
}

function Tracking() {
	const t = useSceneT();
	const toast =
		interpolate(t, [0.1, 0.16], [0, 1], {
			extrapolateLeft: "clamp",
			extrapolateRight: "clamp",
		}) *
		interpolate(t, [0.3, 0.34], [1, 0], {
			extrapolateLeft: "clamp",
			extrapolateRight: "clamp",
		});
	const running = t > 0.32;
	const paused = t > 0.55 && t < 0.72;
	const idle = interpolate(t, [0.72, 0.77], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const label = (text: string, at: number, until: number) => {
		const o = interpolate(
			t,
			[at, at + 0.03, until - 0.03, until],
			[0, 1, 1, 0],
			{ extrapolateLeft: "clamp", extrapolateRight: "clamp" },
		);
		return (
			<div
				style={{
					position: "absolute",
					left: 0,
					right: 0,
					top: 150,
					textAlign: "center",
					fontFamily: F.sans,
					fontWeight: 600,
					fontSize: 26,
					color: C.fg,
					opacity: o,
				}}
			>
				<span
					style={{ background: C.rose, padding: "8px 18px", borderRadius: 10 }}
				>
					{text}
				</span>
			</div>
		);
	};
	return (
		<AbsoluteFill>
			<Background />
			<SceneTitle kicker="Automatic" title="Tracking that keeps up with you" />
			<EditorBackdrop
				status={
					running ? (
						<span
							style={{
								background: paused ? "#4a4752" : "#2a4a7a",
								color: "#fff",
								padding: "2px 14px",
								borderRadius: 4,
								fontFamily: F.mono,
								fontSize: 17,
							}}
						>
							{paused ? "⏸ SMP · paused" : "● SMP · webhook · 49:12"}
						</span>
					) : (
						<span style={{ fontFamily: F.mono, fontSize: 17 }}>▶ Deep</span>
					)
				}
			>
				<Toast show={toast} />
			</EditorBackdrop>
			{label("Open a linked folder → Deep asks", 0.1, 0.32)}
			{label("Edit another project → offer to switch", 0.34, 0.54)}
			{label("Close the project → session pauses", 0.55, 0.71)}
			<div
				style={{
					position: "absolute",
					inset: 0,
					background: `rgba(8,7,10,${0.6 * idle})`,
				}}
			/>
			<IdleCard show={idle} />
		</AbsoluteFill>
	);
}

const SCIENCE = [
	[
		"Implementation intentions",
		"“In this session I will…” makes follow-through far more likely.",
	],
	[
		"Zeigarnik effect",
		"Unfinished thoughts nag. The parking lot lets them go.",
	],
	["Attention residue", "Every switch costs focus. One session at a time."],
	["Planning fallacy", "Everyone underestimates. Deep learns your multiplier."],
	["Self-compassion", "Forgiving a slip beats guilt. No red “overdue”."],
];

function Science() {
	const t = useSceneT();
	return (
		<AbsoluteFill>
			<Background accent={C.admin} />
			<SceneTitle kicker="Why it works" title="Built on research about focus" />
			<div
				style={{
					position: "absolute",
					left: 96,
					right: 96,
					top: 260,
					display: "grid",
					gridTemplateColumns: "repeat(5, 1fr)",
					gap: 20,
				}}
			>
				{SCIENCE.map(([name, line], i) => {
					const start = 0.3 + i * 0.1;
					const on = interpolate(t, [start, start + 0.06], [0, 1], {
						extrapolateLeft: "clamp",
						extrapolateRight: "clamp",
					});
					return (
						<div
							key={name}
							style={{
								background: C.surface,
								border: `1px solid ${C.line}`,
								borderRadius: 20,
								padding: "30px 24px",
								minHeight: 330,
								opacity: on,
								transform: `translateY(${(1 - on) * 30}px)`,
								display: "flex",
								flexDirection: "column",
								gap: 16,
							}}
						>
							<span
								style={{
									fontFamily: F.display,
									fontWeight: 800,
									fontSize: 32,
									color: C.fg,
									lineHeight: 1.1,
								}}
							>
								{name}
							</span>
							<span
								style={{
									fontFamily: F.sans,
									fontSize: 24,
									color: C.muted,
									lineHeight: 1.4,
								}}
							>
								{line}
							</span>
						</div>
					);
				})}
			</div>
		</AbsoluteFill>
	);
}

const KEYS: [string[], string][] = [
	[["Ctrl", "Shift", "Space"], "Quick capture, anywhere"],
	[["Ctrl", "K"], "Command bar and AI"],
	[["S"], "Start a session"],
	[["Space"], "Pause / resume"],
	[["E"], "End the session"],
	[["F"], "Focus screen"],
	[["U"], "Log an urge"],
	[["I"], "Log an interruption"],
	[["N"], "New task"],
	[["Esc"], "Back to the plan"],
];

function Keys() {
	const t = useSceneT();
	return (
		<AbsoluteFill>
			<Background />
			<SceneTitle kicker="Cheat sheet" title="Keys worth remembering" />
			<div
				style={{
					position: "absolute",
					left: 140,
					right: 140,
					top: 250,
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					columnGap: 80,
					rowGap: 28,
				}}
			>
				{KEYS.map(([ks, label], i) => {
					const on = interpolate(
						t,
						[0.05 + i * 0.05, 0.12 + i * 0.05],
						[0, 1],
						{ extrapolateLeft: "clamp", extrapolateRight: "clamp" },
					);
					return (
						<div
							key={label}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 22,
								opacity: on,
							}}
						>
							<div style={{ display: "flex", gap: 8, minWidth: 330 }}>
								{ks.map((k) => (
									<Keycap key={k}>{k}</Keycap>
								))}
							</div>
							<span style={{ fontFamily: F.sans, fontSize: 30, color: C.fg }}>
								{label}
							</span>
						</div>
					);
				})}
			</div>
		</AbsoluteFill>
	);
}

function Outro() {
	const frame = useCurrentFrame();
	const fill = interpolate(frame, [0, 200], [0.62, 0.62]);
	const a = useEnter(0.1);
	const b = useEnter(0.8);
	const c = useProgress(2, 3);
	return (
		<AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
			<Background accent={C.rose} />
			<div
				style={{
					position: "relative",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: 30,
					marginTop: -40,
				}}
			>
				<div style={{ opacity: a, transform: `scale(${0.85 + 0.15 * a})` }}>
					<LogoDisc size={150} fill={fill} />
				</div>
				<div
					style={{
						fontFamily: F.display,
						fontWeight: 800,
						fontSize: 74,
						letterSpacing: -2,
						color: C.fg,
						opacity: b,
						textAlign: "center",
					}}
				>
					Your next focused hour is one key away.
				</div>
				<div
					style={{ display: "flex", gap: 18, opacity: c, alignItems: "center" }}
				>
					<span style={{ fontFamily: F.mono, fontSize: 30, color: C.muted }}>
						bun run app
					</span>
					<span style={{ color: C.faint, fontSize: 30 }}>·</span>
					<Keycap big>S</Keycap>
				</div>
			</div>
		</AbsoluteFill>
	);
}

/* ------------------------------------------------------------------ */

/** Two screenshots back to back: the second fades in at `at` (0–1 of the scene). */
function ShotPair({
	first,
	second,
	at,
}: {
	first: ReactNode;
	second: ReactNode;
	at: number;
}) {
	const t = useSceneT();
	const o = interpolate(t, [at, at + 0.04], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	return (
		<>
			<div style={{ position: "absolute", inset: 0, opacity: 1 - o }}>
				{first}
			</div>
			<div style={{ position: "absolute", inset: 0, opacity: o }}>{second}</div>
		</>
	);
}

export const SCENES: Record<
	SceneId,
	{ accent?: string; render: () => ReactNode }
> = {
	intro: { render: () => <Intro /> },
	loop: { render: () => <Loop /> },
	setup: { render: () => <Setup /> },
	projects: {
		render: () => (
			<>
				<Background />
				<SceneTitle
					kicker="Step 1 · Projects"
					title="Link each project to its repo"
				/>
				<AppShot
					src="shots/07-projects.png"
					{...SHOT}
					marks={[
						{
							x: 296,
							y: 199,
							w: 332,
							h: 20,
							from: 0.28,
							to: 0.6,
							label: "Linked repo folder → VS Code tracking",
						},
						{
							x: 903,
							y: 132,
							w: 90,
							h: 20,
							from: 0.66,
							to: 1,
							label: "Billable, with a rate",
						},
					]}
				/>
			</>
		),
	},
	dump: {
		render: () => (
			<>
				<Background accent={C.rose} />
				<SceneTitle kicker="Morning · Start my day" title="Talk it out" />
				<ShotPair
					at={0.32}
					first={
						<AppShot
							src="shots/01-leftovers.png"
							{...SHOT}
							marks={[
								{
									x: 389,
									y: 144,
									w: 762,
									h: 70,
									from: 0.12,
									to: 0.3,
									label: "Keep it, park it, or let it go",
								},
							]}
						/>
					}
					second={
						<AppShot
							src="shots/02-dump.png"
							{...SHOT}
							marks={[
								{
									x: 405,
									y: 181,
									w: 60,
									h: 60,
									from: 0.42,
									to: 0.66,
									label: "Press to talk",
									side: "bottom",
								},
								{
									x: 390,
									y: 267,
									w: 760,
									h: 185,
									from: 0.68,
									to: 1,
									label: "Transcribed locally by Whisper",
									side: "bottom",
								},
							]}
						/>
					}
				/>
			</>
		),
	},
	review: {
		render: () => (
			<>
				<Background accent={C.rose} />
				<SceneTitle kicker="Morning · Review" title="Words become tasks" />
				<AppShot
					src="shots/03-review.png"
					{...SHOT}
					marks={[
						{
							x: 820,
							y: 182,
							w: 368,
							h: 362,
							from: 0.12,
							to: 0.36,
							label: "Project · estimate · energy",
							side: "left",
						},
						{
							x: 408,
							y: 204,
							w: 300,
							h: 16,
							from: 0.36,
							to: 0.52,
							label: "A tiny first step",
						},
						{
							x: 340,
							y: 427,
							w: 860,
							h: 54,
							from: 0.53,
							to: 0.8,
							label: "Meetings go on the timeline",
							side: "bottom",
						},
						{
							x: 1078,
							y: 637,
							w: 122,
							h: 36,
							from: 0.82,
							to: 1,
							label: "Nothing saved until you confirm",
							side: "left",
						},
					]}
				/>
			</>
		),
	},
	plan: {
		render: () => (
			<>
				<Background accent={C.cloud} />
				<SceneTitle
					kicker="Morning · Plan"
					title="Three big rocks, real hours"
				/>
				<AppShot
					src="shots/04-plan.png"
					{...SHOT}
					marks={[
						{
							x: 244,
							y: 224,
							w: 26,
							h: 198,
							from: 0.08,
							to: 0.3,
							label: "Star your top 3",
							side: "right",
						},
						{
							x: 932,
							y: 400,
							w: 324,
							h: 276,
							from: 0.3,
							to: 0.55,
							label: "Drag onto the timeline",
							side: "left",
						},
						{
							x: 248,
							y: 145,
							w: 610,
							h: 42,
							from: 0.56,
							to: 1,
							label: "Does the day fit? Based on your real pace",
							side: "bottom",
						},
					]}
				/>
			</>
		),
	},
	today: {
		render: () => (
			<>
				<Background />
				<SceneTitle kicker="During the day" title="Today, at a glance" />
				<AppShot
					src="shots/05-today.png"
					{...SHOT}
					marks={[
						{
							x: 248,
							y: 283,
							w: 606,
							h: 240,
							from: 0.1,
							to: 0.42,
							label: "Your three big rocks",
							side: "right",
						},
						{
							x: 248,
							y: 107,
							w: 606,
							h: 70,
							from: 0.45,
							to: 0.7,
							label: "Deep work vs your daily target",
							side: "bottom",
						},
						{
							x: 1255,
							y: 76,
							w: 16,
							h: 264,
							from: 0.72,
							to: 1,
							label: "What actually happened",
							side: "left",
						},
					]}
				/>
			</>
		),
	},
	start: {
		render: () => (
			<>
				<Background />
				<SceneTitle kicker="Focus · Start" title="Press S, write one line" />
				<AppShot
					src="shots/14-start.png"
					{...SHOT}
					marks={[
						{
							x: 401,
							y: 444,
							w: 518,
							h: 62,
							from: 0.12,
							to: 0.3,
							label: "Pick a timer",
							side: "left",
						},
						{
							x: 401,
							y: 570,
							w: 518,
							h: 36,
							from: 0.3,
							to: 0.62,
							label: "In this session I will…",
							side: "bottom",
						},
						{
							x: 401,
							y: 340,
							w: 518,
							h: 64,
							from: 0.64,
							to: 1,
							label: "Where you left off last time",
							side: "left",
						},
					]}
				/>
			</>
		),
	},
	timers: { render: () => <Timers /> },
	focus: {
		render: () => (
			<>
				<Background accent={C.smp} />
				<SceneTitle kicker="Focus" title="One thing on screen" />
				<AppShot
					src="shots/09-focus.png"
					{...SHOT}
					marks={[
						{
							x: 466,
							y: 326,
							w: 284,
							h: 284,
							from: 0.1,
							to: 0.33,
							label: "Time you can see",
							side: "left",
						},
						{
							x: 1008,
							y: 64,
							w: 270,
							h: 152,
							from: 0.35,
							to: 0.55,
							label: "Parking lot",
							side: "left",
						},
						{
							x: 1008,
							y: 252,
							w: 270,
							h: 30,
							from: 0.56,
							to: 1,
							label: "U = urge · I = interrupted",
							side: "left",
						},
					]}
				/>
			</>
		),
	},
	capture: { render: () => <CaptureScene /> },
	end: {
		render: () => (
			<>
				<Background accent={C.good} />
				<SceneTitle kicker="Focus · End" title="Close the loop, then rest" />
				<ShotPair
					at={0.5}
					first={
						<AppShot
							src="shots/12-end.png"
							{...SHOT}
							marks={[
								{
									x: 431,
									y: 338,
									w: 458,
									h: 64,
									from: 0.1,
									to: 0.25,
									label: "How did it go?",
									side: "left",
								},
								{
									x: 431,
									y: 442,
									w: 458,
									h: 80,
									from: 0.25,
									to: 0.5,
									label: "Where I left off",
									side: "left",
								},
							]}
						/>
					}
					second={
						<AppShot
							src="shots/13-break.png"
							{...SHOT}
							marks={[
								{
									x: 421,
									y: 410,
									w: 478,
									h: 128,
									from: 0.62,
									to: 1,
									label: "Sort the parking lot",
									side: "left",
								},
							]}
						/>
					}
				/>
			</>
		),
	},
	tracking: { render: () => <Tracking /> },
	ai: {
		render: () => (
			<>
				<Background accent={C.rose} />
				<SceneTitle
					kicker="AI helpers"
					title="Make it smaller · ask the command bar"
				/>
				<ShotPair
					at={0.52}
					first={
						<AppShot
							src="shots/17-split.png"
							{...SHOT}
							marks={[
								{
									x: 401,
									y: 324,
									w: 518,
									h: 256,
									from: 0.12,
									to: 0.5,
									label: "Steps of 25 minutes or less",
									side: "left",
								},
							]}
						/>
					}
					second={
						<AppShot
							src="shots/15-palette.png"
							{...SHOT}
							marks={[
								{
									x: 367,
									y: 159,
									w: 586,
									h: 36,
									from: 0.62,
									to: 1,
									label: "Ctrl+K → plain English",
									side: "right",
								},
							]}
						/>
					}
				/>
			</>
		),
	},
	shutdown: {
		render: () => (
			<>
				<Background accent={C.admin} />
				<SceneTitle kicker="Evening" title="Shut the day down" />
				<ShotPair
					at={0.86}
					first={
						<AppShot
							src="shots/18-shutdown.png"
							{...SHOT}
							marks={[
								{
									x: 248,
									y: 78,
									w: 512,
									h: 102,
									from: 0.08,
									to: 0.25,
									label: "Planned vs actual",
									side: "bottom",
								},
								{
									x: 563,
									y: 246,
									w: 100,
									h: 240,
									from: 0.25,
									to: 0.42,
									label: "Move it to tomorrow",
									side: "left",
								},
								{
									x: 782,
									y: 108,
									w: 510,
									h: 170,
									from: 0.42,
									to: 0.6,
									label: "Three quick questions",
									side: "bottom",
								},
								{
									x: 782,
									y: 298,
									w: 510,
									h: 178,
									from: 0.6,
									to: 0.72,
									label: "AI summary",
									side: "left",
								},
								{
									x: 782,
									y: 520,
									w: 510,
									h: 86,
									from: 0.72,
									to: 0.86,
									label: "Tomorrow's top 3",
									side: "left",
								},
							]}
						/>
					}
					second={<AppShot src="shots/19-done.png" {...SHOT} />}
				/>
			</>
		),
	},
	stats: {
		render: () => (
			<>
				<Background />
				<SceneTitle kicker="Over time" title="Learn how you actually work" />
				<AppShot
					src="shots/06-stats.png"
					{...SHOT}
					marks={[
						{
							x: 280,
							y: 245,
							w: 482,
							h: 145,
							from: 0.1,
							to: 0.4,
							label: "Where your hours go",
							side: "bottom",
						},
						{
							x: 778,
							y: 245,
							w: 482,
							h: 145,
							from: 0.42,
							to: 1,
							label: "Your estimate multiplier",
							side: "bottom",
						},
					]}
				/>
			</>
		),
	},
	science: { render: () => <Science /> },
	keys: { render: () => <Keys /> },
	outro: { render: () => <Outro /> },
};
