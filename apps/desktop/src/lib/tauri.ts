import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const inTauri =
	typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function windowLabel(): string {
	if (!inTauri)
		return new URLSearchParams(location.search).get("window") ?? "main";
	return getCurrentWindow().label;
}

async function call(cmd: string, args?: Record<string, unknown>) {
	if (!inTauri) return;
	try {
		await invoke(cmd, args);
	} catch (err) {
		console.warn(`[tauri] ${cmd} failed`, err);
	}
}

export const desktop = {
	showMini: () => call("show_mini"),
	hideMini: () => call("hide_mini"),
	showCapture: () => call("show_capture"),
	hideCapture: () => call("hide_capture"),
	showMain: () => call("show_main"),
	setTrayTooltip: (text: string) => call("set_tray_tooltip", { text }),
	quit: () => call("quit_app"),
	hideSelf: async () => {
		if (inTauri) await getCurrentWindow().hide();
	},
	startDrag: async () => {
		if (inTauri) await getCurrentWindow().startDragging();
	},
	isFocused: async () =>
		inTauri ? getCurrentWindow().isFocused() : document.hasFocus(),
};

export async function onTauriEvent(
	name: string,
	fn: () => void,
): Promise<UnlistenFn> {
	if (!inTauri) return () => {};
	return listen(name, fn);
}

let notifyReady: boolean | null = null;

export async function notify(title: string, body: string) {
	if (!inTauri) {
		if ("Notification" in window && Notification.permission === "granted")
			new Notification(title, { body });
		return;
	}
	const n = await import("@tauri-apps/plugin-notification");
	if (notifyReady === null) {
		notifyReady = await n.isPermissionGranted();
		if (!notifyReady) notifyReady = (await n.requestPermission()) === "granted";
	}
	if (notifyReady) n.sendNotification({ title, body });
}

export async function pickFolder(): Promise<string | null> {
	if (!inTauri) return null;
	const { open } = await import("@tauri-apps/plugin-dialog");
	const res = await open({
		directory: true,
		multiple: false,
		title: "Choose the project folder",
	});
	return typeof res === "string" ? res : null;
}

export async function autostart(enable?: boolean): Promise<boolean> {
	if (!inTauri) return false;
	const a = await import("@tauri-apps/plugin-autostart");
	if (enable === true) await a.enable();
	if (enable === false) await a.disable();
	return a.isEnabled();
}
