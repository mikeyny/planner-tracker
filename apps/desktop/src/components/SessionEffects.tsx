import { formatClock, hhmmToMin, localDate } from "@deep/shared";
import { useEffect, useRef } from "react";
import { api } from "../lib/api";
import { useTimer } from "../lib/hooks";
import { onServerEvent } from "../lib/live";
import { session, useSettings } from "../lib/queries";
import { chime, setAmbient, stopAmbient } from "../lib/sound";
import { desktop, notify, onTauriEvent } from "../lib/tauri";
import { attempt, setUi } from "../lib/ui";

/** Side effects of the running session: bells, notifications, tray text, mini timer, sound. */
export function SessionEffects() {
	const { session: s, remaining, elapsed, paused } = useTimer();
	const { data: settings } = useSettings();
	const lastId = useRef<number | null>(null);
	const firedEnd = useRef<number | null>(null);
	const lastQuarter = useRef(0);
	const lastTooltip = useRef("");

	// Mini timer follows the session.
	useEffect(() => {
		// Wait for settings, or a session that arrives first would be marked as handled.
		if (!settings) return;
		const id = s?.id ?? null;
		if (id === lastId.current) return;
		const wasRunning = lastId.current !== null;
		lastId.current = id;
		lastQuarter.current = 0;
		if (s && settings.autoMiniTimer) desktop.showMini();
		if (!s && wasRunning) desktop.hideMini();
	}, [s, settings]);

	// Time's up.
	useEffect(() => {
		if (!s || remaining === null || paused) return;
		if (remaining <= 0 && firedEnd.current !== s.id) {
			firedEnd.current = s.id;
			chime(s.kind === "break" ? "break" : "end");
			if (settings?.notifications) {
				if (s.kind === "break")
					notify("Break's over", "Ready for the next block?");
				else if (s.mode === "just5")
					notify("Five minutes done", "The hardest part is over. Keep going?");
				else
					notify(
						"Time's up",
						`${s.task?.title ?? s.project?.name ?? "Focus session"}: finish your sentence, then take a break.`,
					);
			}
		}
	}, [s, remaining, paused, settings?.notifications]);

	// Optional quarter-hour chime against time blindness.
	useEffect(() => {
		if (s?.kind !== "focus" || paused || !settings?.chimeEvery15) return;
		const q = Math.floor(elapsed / 900);
		if (q > lastQuarter.current) {
			lastQuarter.current = q;
			chime("soft");
		}
	}, [s, elapsed, paused, settings?.chimeEvery15]);

	// Background sound only while focusing.
	useEffect(() => {
		const on =
			s?.kind === "focus" && !paused && settings && settings.sound !== "off";
		if (on) setAmbient(settings.sound, settings.soundVolume);
		else stopAmbient();
	}, [s?.kind, paused, settings?.sound, settings?.soundVolume, settings]);

	// Tray tooltip.
	useEffect(() => {
		const text = !s
			? "Deep: no session"
			: `Deep: ${s.kind === "break" ? "break" : (s.project?.name ?? "focus")} ${paused ? "(paused) " : ""}${
					remaining !== null
						? `${formatClock(remaining)} left`
						: formatClock(elapsed)
				}`;
		if (text !== lastTooltip.current) {
			lastTooltip.current = text;
			desktop.setTrayTooltip(text);
		}
	}, [s, remaining, elapsed, paused]);

	// Tray menu "Pause / resume", and requests from the mini timer window.
	useEffect(() => {
		const offs = [
			onTauriEvent("tray-toggle", () => void attempt(session.toggle)),
			onTauriEvent("open-focus", () => setUi({ focusOpen: true })),
			onTauriEvent("open-end", () =>
				setUi({ endDialog: true, focusOpen: true }),
			),
			onTauriEvent("open-start", () => setUi({ startDialog: {} })),
		];
		return () => {
			for (const o of offs) o.then((f) => f());
		};
	}, []);

	// Bring the window forward when you come back from being idle.
	useEffect(
		() =>
			onServerEvent((e) => {
				if (e.type === "idle_return") desktop.showMain();
			}),
		[],
	);

	// Shutdown reminder, once a day.
	useEffect(() => {
		if (!settings) return;
		const t = setInterval(async () => {
			const now = new Date();
			const key = `deep.shutdownNudge.${localDate(now)}`;
			if (
				now.getHours() * 60 + now.getMinutes() <
				hhmmToMin(settings.shutdownTime)
			)
				return;
			try {
				if (localStorage.getItem(key)) return;
				localStorage.setItem(key, "1");
			} catch {
				return;
			}
			const day = await api.get<{
				plan: { startedAt: string | null; shutdownAt: string | null };
			}>(`/day/${localDate(now)}`);
			if (
				day.plan.startedAt &&
				!day.plan.shutdownAt &&
				settings.notifications
			) {
				notify(
					"Time to shut down",
					"Three minutes to close the day and plan tomorrow.",
				);
			}
		}, 60_000);
		return () => clearInterval(t);
	}, [settings]);

	return null;
}
