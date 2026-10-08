/** Same palette and type as the app, so the video feels like the product. */
export const C = {
	bg: "#0f0e12",
	surface: "#17161c",
	raised: "#201e26",
	line: "#2b2932",
	lineStrong: "#3a3742",
	fg: "#eceaf0",
	muted: "#8f8a98",
	faint: "#5d5966",
	rose: "#e2456f",
	warn: "#f2b33d",
	good: "#2fb35a",
	smp: "#3987e5",
	cloud: "#d95926",
	agri: "#199e70",
	admin: "#9085e9",
} as const;

export const F = {
	sans: "Onest, 'Segoe UI', sans-serif",
	display: "'Schibsted Grotesk', 'Segoe UI', sans-serif",
	mono: "'Martian Mono', Consolas, monospace",
} as const;

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
/** Cross-fade between scenes, in frames. */
export const FADE = 14;
