import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	type ActiveState,
	elapsedSec,
	formatClock,
	type HeartbeatInput,
	type HeartbeatResult,
	remainingSec,
	type ServerEvent,
	type Task,
} from "@deep/shared";
import * as vscode from "vscode";

const HEARTBEAT_EVERY_MS = 60_000;
const ACTIVITY_THROTTLE_MS = 20_000;
const EDIT_WINDOW_MS = 90_000;

interface Connection {
	url: string;
	token: string;
}

let conn: Connection | null = null;
let state: ActiveState | null = null;
let status: vscode.StatusBarItem;
let lastBeat = 0;
let lastEdit = 0;
let ws: WebSocket | null = null;
let disposed = false;
let promptOpen = false;

function readConnection(): Connection | null {
	try {
		return JSON.parse(
			readFileSync(join(homedir(), ".deep", "connection.json"), "utf8"),
		) as Connection;
	} catch {
		return null;
	}
}

async function call<T>(
	method: string,
	path: string,
	body?: unknown,
): Promise<T> {
	conn ??= readConnection();
	if (!conn)
		throw new Error("Deep isn't running (no ~/.deep/connection.json yet).");
	const res = await fetch(`${conn.url}/api${path}`, {
		method,
		headers: { "X-Deep-Token": conn.token, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(5000),
	}).catch((err) => {
		// The API may have restarted with a new token or port.
		conn = null;
		throw err;
	});
	const data = (await res.json().catch(() => null)) as T & { message?: string };
	if (!res.ok) {
		if (res.status === 401) conn = null;
		throw new Error(data?.message ?? `Deep API error ${res.status}`);
	}
	return data;
}

/* ---------------- status bar ---------------- */

function renderStatus() {
	const s = state?.session;
	if (!s) {
		status.text = "$(play) Deep";
		status.tooltip = "Deep: no session. Click to start focus.";
		status.backgroundColor = undefined;
		return;
	}
	const rem = remainingSec(s);
	const clock = formatClock(rem ?? elapsedSec(s));
	const name = s.kind === "break" ? "Break" : (s.project?.name ?? "Focus");
	const icon = s.pausedAt
		? "$(debug-pause)"
		: s.kind === "break"
			? "$(coffee)"
			: "$(circle-filled)";
	status.text = `${icon} ${name}${s.task ? ` · ${truncate(s.task.title, 28)}` : ""} · ${clock}`;
	status.tooltip = `${s.task?.title ?? name}${s.intention ? `\nIn this session I will ${s.intention}` : ""}\nClick for options`;
	status.backgroundColor =
		rem !== null && rem < 0
			? new vscode.ThemeColor("statusBarItem.warningBackground")
			: undefined;
}

function truncate(s: string, n: number) {
	return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/* ---------------- live state ---------------- */

function connectSocket() {
	if (disposed) return;
	conn ??= readConnection();
	if (!conn || typeof WebSocket === "undefined") {
		setTimeout(connectSocket, 10_000);
		return;
	}
	const url = `${conn.url.replace("http", "ws")}/ws?token=${encodeURIComponent(conn.token)}`;
	ws = new WebSocket(url);
	ws.onmessage = (msg) => {
		const e = JSON.parse(String(msg.data)) as ServerEvent;
		if (e.type === "state") {
			state = e.state;
			renderStatus();
		}
	};
	ws.onclose = () => {
		ws = null;
		state = null;
		renderStatus();
		if (!disposed) setTimeout(connectSocket, 5000);
	};
	ws.onerror = () => {
		conn = null;
		ws?.close();
	};
}

/* ---------------- heartbeats ---------------- */

function currentBranch(): string | null {
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (!folder) return null;
	try {
		const head = readFileSync(
			join(folder.uri.fsPath, ".git", "HEAD"),
			"utf8",
		).trim();
		return head.startsWith("ref: refs/heads/")
			? head.slice(16)
			: head.slice(0, 8);
	} catch {
		return null;
	}
}

async function heartbeat(force = false) {
	const now = Date.now();
	if (!force && now - lastBeat < ACTIVITY_THROTTLE_MS) return;
	const folders = vscode.workspace.workspaceFolders ?? [];
	if (folders.length === 0) return;
	lastBeat = now;
	const editor = vscode.window.activeTextEditor;
	const input: HeartbeatInput = {
		windowId: vscode.env.sessionId,
		workspaces: folders.map((f) => f.uri.fsPath),
		file:
			editor?.document.uri.scheme === "file"
				? editor.document.uri.fsPath
				: null,
		language: editor?.document.languageId ?? null,
		branch: currentBranch(),
		focused: vscode.window.state.focused,
		editing: now - lastEdit < EDIT_WINDOW_MS,
	};
	try {
		const res = await call<HeartbeatResult>(
			"POST",
			"/activity/heartbeat",
			input,
		);
		state = res.state;
		renderStatus();
		if (res.suggest && res.project && !promptOpen)
			void suggest(res.suggest, res.project);
	} catch {
		// Deep isn't running; stay quiet and try again next beat.
	}
}

async function suggest(
	kind: "start" | "switch",
	project: { id: number; name: string },
) {
	promptOpen = true;
	try {
		if (kind === "start") {
			const pick = await vscode.window.showInformationMessage(
				`Deep: you opened ${project.name}. Start a focus session?`,
				"Start 50 min",
				"Pick task…",
				"Not now",
			);
			if (pick === "Start 50 min")
				await startSession({ projectId: project.id, mode: "deep50" });
			if (pick === "Pick task…") await pickTaskAndStart(project.id);
		} else {
			const current = state?.session?.project?.name ?? "another project";
			const pick = await vscode.window.showInformationMessage(
				`Deep: you're editing ${project.name}, but the session is on ${current}. Switch?`,
				`Switch to ${project.name}`,
				"Keep",
			);
			if (pick?.startsWith("Switch"))
				await startSession({ projectId: project.id });
		}
	} finally {
		promptOpen = false;
	}
}

/* ---------------- commands ---------------- */

async function startSession(body: {
	projectId?: number | null;
	taskId?: number | null;
	mode?: string;
}) {
	try {
		state = await call<ActiveState>("POST", "/session/start", {
			...body,
			source: "vscode",
		});
		renderStatus();
	} catch (err) {
		vscode.window.showErrorMessage(`Deep: ${(err as Error).message}`);
	}
}

async function pickTaskAndStart(projectId?: number) {
	try {
		const today = new Date().toLocaleDateString("en-CA");
		const tasks = await call<Task[]>(
			"GET",
			`/tasks?view=today&date=${today}${projectId ? `&projectId=${projectId}` : ""}`,
		);
		const open = tasks.filter((t) => t.status === "open");
		const items: (vscode.QuickPickItem & { taskId: number | null })[] = [
			...open.map((t) => ({
				label: `${t.isTop3 ? "$(star-full) " : ""}${t.title}`,
				description: t.estimateMin ? `${t.estimateMin} min` : undefined,
				taskId: t.id,
			})),
			{ label: "$(circle-outline) No specific task", taskId: null },
		];
		const pick = await vscode.window.showQuickPick(items, {
			placeHolder: "What are you working on?",
		});
		if (!pick) return;
		await startSession({
			taskId: pick.taskId,
			projectId: pick.taskId ? undefined : projectId,
		});
	} catch (err) {
		vscode.window.showErrorMessage(`Deep: ${(err as Error).message}`);
	}
}

async function stopSession() {
	if (!state?.session) {
		vscode.window.showInformationMessage("Deep: no session is running.");
		return;
	}
	const outcome = await vscode.window.showQuickPick(
		[
			{ label: "$(check) Task done", value: "done" },
			{ label: "$(arrow-up) Made progress", value: "progress" },
			{ label: "$(circle-slash) Blocked", value: "blocked" },
		],
		{ placeHolder: "How did it go?" },
	);
	if (!outcome) return;
	const note = await vscode.window.showInputBox({
		prompt: "Where did you leave off? (shown next time you open this project)",
		placeHolder: "Next: …",
	});
	try {
		const res = await call<{ breakMin: number; state: ActiveState }>(
			"POST",
			"/session/stop",
			{
				outcome: outcome.value,
				leftOffNote: note || null,
			},
		);
		state = res.state;
		renderStatus();
		if (res.breakMin > 0) {
			const pick = await vscode.window.showInformationMessage(
				`Nice. Take a ${res.breakMin}-minute break away from the screen?`,
				"Start break",
				"Skip",
			);
			if (pick === "Start break") {
				state = await call<ActiveState>("POST", "/session/break", {
					minutes: res.breakMin,
				});
				renderStatus();
			}
		}
	} catch (err) {
		vscode.window.showErrorMessage(`Deep: ${(err as Error).message}`);
	}
}

async function captureThought(kind: "parking" | "urge") {
	const text =
		kind === "urge"
			? await vscode.window.showInputBox({
					prompt: "What pulled at you? (optional)",
					placeHolder: "Check WhatsApp",
				})
			: await vscode.window.showInputBox({
					prompt: "Capture a thought for later",
					placeHolder: "Webhook retries need a backoff",
				});
	if (text === undefined) return;
	if (kind === "parking" && !text.trim()) return;
	try {
		await call("POST", "/captures", { text: text.trim(), kind });
		vscode.window.setStatusBarMessage(
			kind === "urge" ? "Deep: urge logged. Back to it." : "Deep: captured.",
			2500,
		);
	} catch (err) {
		vscode.window.showErrorMessage(`Deep: ${(err as Error).message}`);
	}
}

async function toggle() {
	try {
		state = await call<ActiveState>("POST", "/session/toggle");
		renderStatus();
	} catch (err) {
		vscode.window.showErrorMessage(`Deep: ${(err as Error).message}`);
	}
}

async function menu() {
	const s = state?.session;
	if (!s) {
		await pickTaskAndStart();
		return;
	}
	const pick = await vscode.window.showQuickPick(
		[
			{
				label: s.pausedAt ? "$(play) Resume" : "$(debug-pause) Pause",
				id: "toggle",
			},
			{ label: "$(add) 10 more minutes", id: "extend" },
			{ label: "$(lightbulb) Capture a thought", id: "capture" },
			{ label: "$(zap) Log a distraction urge", id: "urge" },
			{ label: "$(debug-stop) End session", id: "stop" },
		],
		{ placeHolder: `${s.task?.title ?? s.project?.name ?? "Focus"}` },
	);
	if (!pick) return;
	if (pick.id === "toggle") await toggle();
	if (pick.id === "extend") {
		state = await call<ActiveState>("POST", "/session/extend", {
			minutes: 10,
		}).catch(() => state);
		renderStatus();
	}
	if (pick.id === "capture") await captureThought("parking");
	if (pick.id === "urge") await captureThought("urge");
	if (pick.id === "stop") await stopSession();
}

/* ---------------- lifecycle ---------------- */

export function activate(context: vscode.ExtensionContext) {
	status = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		100,
	);
	status.command = "deep.menu";
	renderStatus();
	status.show();

	const tick = setInterval(renderStatus, 1000);
	const beat = setInterval(() => {
		if (vscode.window.state.focused) void heartbeat(true);
	}, HEARTBEAT_EVERY_MS);

	context.subscriptions.push(
		status,
		{ dispose: () => clearInterval(tick) },
		{ dispose: () => clearInterval(beat) },
		vscode.commands.registerCommand("deep.start", () => pickTaskAndStart()),
		vscode.commands.registerCommand("deep.pauseResume", toggle),
		vscode.commands.registerCommand("deep.stop", stopSession),
		vscode.commands.registerCommand("deep.capture", () =>
			captureThought("parking"),
		),
		vscode.commands.registerCommand("deep.urge", () => captureThought("urge")),
		vscode.commands.registerCommand("deep.menu", menu),
		vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.scheme !== "file" || e.contentChanges.length === 0)
				return;
			lastEdit = Date.now();
			void heartbeat();
		}),
		vscode.workspace.onDidSaveTextDocument(() => void heartbeat()),
		vscode.window.onDidChangeActiveTextEditor(() => void heartbeat()),
		vscode.window.onDidChangeWindowState((w) => {
			if (w.focused) void heartbeat(true);
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(() => void heartbeat(true)),
	);

	connectSocket();
	setTimeout(() => void heartbeat(true), 3000);
}

export async function deactivate() {
	disposed = true;
	ws?.close();
	try {
		await call("POST", "/activity/vscode-closed", {
			windowId: vscode.env.sessionId,
		});
	} catch {
		// Deep isn't running.
	}
}
