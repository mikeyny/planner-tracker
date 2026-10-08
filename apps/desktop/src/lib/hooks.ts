import { elapsedSec, remainingSec } from "@deep/shared";
import { useEffect, useState } from "react";
import { useLiveState } from "./live";

/** Re-render every `ms` milliseconds. */
export function useNow(ms = 1000) {
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), ms);
		return () => clearInterval(t);
	}, [ms]);
	return now;
}

/** The live session plus derived timer numbers, ticking every second. */
export function useTimer() {
	const state = useLiveState();
	const now = useNow(1000);
	const s = state?.session ?? null;
	const elapsed = s ? elapsedSec(s, now) : 0;
	const remaining = s ? remainingSec(s, now) : null;
	const progress =
		s?.plannedSec && remaining !== null
			? Math.max(0, Math.min(1, remaining / s.plannedSec))
			: null;
	return {
		state,
		session: s,
		elapsed,
		remaining,
		/** Fraction of the planned time still left, 1 → 0. null when open-ended. */
		progress,
		paused: !!s?.pausedAt,
		overtime: remaining !== null && remaining < 0,
	};
}

export const PROJECT_COLORS = [
	"#3987e5",
	"#d95926",
	"#199e70",
	"#c98500",
	"#d55181",
	"#9085e9",
	"#e66767",
	"#2f9e44",
];

export const NO_PROJECT_COLOR = "#6f6a78";
