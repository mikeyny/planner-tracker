import type { ServerEvent } from "@deep/shared";
import type { ServerWebSocket } from "bun";

const clients = new Set<ServerWebSocket<unknown>>();

export function addClient(ws: ServerWebSocket<unknown>) {
	clients.add(ws);
}

export function removeClient(ws: ServerWebSocket<unknown>) {
	clients.delete(ws);
}

export function broadcast(event: ServerEvent) {
	const msg = JSON.stringify(event);
	for (const ws of clients) {
		try {
			ws.send(msg);
		} catch {
			clients.delete(ws);
		}
	}
}

export function changed(
	...what: Extract<ServerEvent, { type: "changed" }>["what"]
) {
	broadcast({ type: "changed", what });
}
