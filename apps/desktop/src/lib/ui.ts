import { useSyncExternalStore } from "react";

export type View =
	| "today"
	| "inbox"
	| "projects"
	| "stats"
	| "settings"
	| "startday"
	| "shutdown"
	| "review";

export interface StartTarget {
	taskId?: number | null;
	projectId?: number | null;
}

interface UiState {
	view: View;
	focusOpen: boolean;
	startDialog: StartTarget | null;
	endDialog: boolean;
	palette: boolean;
	toast: { id: number; text: string; tone: "info" | "error" } | null;
	/** After a focus session ends: offer a break of this many minutes. */
	breakOffer: number | null;
	composerFocus: number;
}

/** ?view=stats opens that view (handy for tests); otherwise the last view used. */
function initialView(): View {
	const fromUrl = new URLSearchParams(location.search).get("view");
	if (fromUrl) return fromUrl as View;
	try {
		return (localStorage.getItem("deep.view") as View) || "today";
	} catch {
		return "today";
	}
}

let state: UiState = {
	view: initialView(),
	focusOpen: false,
	startDialog: null,
	endDialog: false,
	palette: false,
	toast: null,
	breakOffer: null,
	composerFocus: 0,
};
const listeners = new Set<() => void>();

export function setUi(patch: Partial<UiState>) {
	state = { ...state, ...patch };
	if (patch.view && !["startday", "shutdown", "review"].includes(patch.view)) {
		try {
			localStorage.setItem("deep.view", patch.view);
		} catch {
			// storage can be unavailable; the view just won't persist
		}
	}
	for (const l of listeners) l();
}

export function getUi() {
	return state;
}

export function useUi<T>(select: (s: UiState) => T): T {
	return useSyncExternalStore(
		(l) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
		() => select(state),
	);
}

let toastId = 0;
export function toast(text: string, tone: "info" | "error" = "info") {
	const id = ++toastId;
	setUi({ toast: { id, text, tone } });
	setTimeout(
		() => {
			if (state.toast?.id === id) setUi({ toast: null });
		},
		tone === "error" ? 6000 : 3200,
	);
}

/** Run an async action, showing its error as a toast. */
export async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
	try {
		return await fn();
	} catch (err) {
		toast(err instanceof Error ? err.message : String(err), "error");
		return undefined;
	}
}

export function isTyping(e: KeyboardEvent) {
	const el = e.target as HTMLElement | null;
	return (
		!!el &&
		(el.tagName === "INPUT" ||
			el.tagName === "TEXTAREA" ||
			el.tagName === "SELECT" ||
			el.isContentEditable)
	);
}
