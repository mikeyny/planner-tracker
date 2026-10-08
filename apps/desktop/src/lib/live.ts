import type { ActiveState, ServerEvent } from "@deep/shared";
import { useSyncExternalStore } from "react";
import { API_URL, TOKEN } from "./api";

type Listener = () => void;
type EventListener = (e: ServerEvent) => void;

let state: ActiveState | null = null;
let connected = false;
const listeners = new Set<Listener>();
const eventListeners = new Set<EventListener>();
let socket: WebSocket | null = null;
let retry = 0;

function emit() {
	for (const l of listeners) l();
}

function connect() {
	const url = `${API_URL.replace("http", "ws")}/ws?token=${encodeURIComponent(TOKEN)}`;
	socket = new WebSocket(url);
	socket.onopen = () => {
		retry = 0;
		connected = true;
		emit();
	};
	socket.onmessage = (msg) => {
		const event = JSON.parse(msg.data as string) as ServerEvent;
		if (event.type === "state") {
			state = event.state;
			emit();
		}
		for (const l of eventListeners) l(event);
	};
	socket.onclose = () => {
		connected = false;
		emit();
		// The API may be starting (or restarting under --watch): back off and retry.
		const delay = Math.min(5000, 400 * 2 ** retry++);
		setTimeout(connect, delay);
	};
	socket.onerror = () => socket?.close();
}

let started = false;
export function startLive() {
	if (started) return;
	started = true;
	connect();
}

/** Apply a state returned by a REST call immediately, before the socket echoes it. */
export function setLiveState(next: ActiveState): ActiveState {
	state = next;
	emit();
	return next;
}

export function useLiveState(): ActiveState | null {
	return useSyncExternalStore(
		(l) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
		() => state,
	);
}

export function useConnected(): boolean {
	return useSyncExternalStore(
		(l) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
		() => connected,
	);
}

export function onServerEvent(fn: EventListener): () => void {
	eventListeners.add(fn);
	return () => eventListeners.delete(fn);
}
