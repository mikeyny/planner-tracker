import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { runMigrations, sql } from "@deep/db";
import type { ServerWebSocket } from "bun";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { startBackupJob } from "./lib/backup";
import { EXTENSION_ID } from "./lib/browser";
import { addClient, broadcast, removeClient } from "./lib/bus";
import { startCalendarJob } from "./lib/calendar";
import { CoachCall, type CoachSocketData, parseCoachMode } from "./lib/coach";
import { buildState } from "./lib/state";
import { startIdleWatcher } from "./lib/watchers";
import { stopWhisper } from "./lib/whisper";
import { startWindowWatcher } from "./lib/winwatch";
import { activityRouter } from "./routes/activity";
import { aiRouter } from "./routes/ai";
import { browserRouter } from "./routes/browser";
import { calendarsRouter } from "./routes/calendars";
import { capturesRouter } from "./routes/captures";
import { dayRouter } from "./routes/day";
import { exportsRouter } from "./routes/exports";
import { projectsRouter } from "./routes/projects";
import { reviewsRouter } from "./routes/reviews";
import { sessionRouter } from "./routes/session";
import { settingsRouter } from "./routes/settings";
import { statsRouter } from "./routes/stats";
import { tasksRouter } from "./routes/tasks";

const PORT = Number(process.env.API_PORT || 4040);
const TOKEN = process.env.DEEP_TOKEN || "";
if (!TOKEN)
	console.warn("[api] DEEP_TOKEN is empty: requests are not authenticated.");

const app = new Hono();

app.onError((err, c) => {
	if (err instanceof HTTPException)
		return c.json({ message: err.message }, err.status);
	if (err instanceof ZodError) {
		return c.json(
			{
				message: err.issues
					.map((i) => `${i.path.join(".")}: ${i.message}`)
					.join(". "),
			},
			400,
		);
	}
	const code = (err.cause as { code?: string } | undefined)?.code;
	if (code === "23503") {
		return c.json(
			{ message: "That project or task doesn't exist any more." },
			400,
		);
	}
	console.error("[api] unhandled error:", err);
	return c.json(
		{ message: "Something went wrong in the local API. Check its console." },
		500,
	);
});

app.use(
	"*",
	cors({
		origin: [
			"http://localhost:5180",
			"http://localhost:5181",
			"http://tauri.localhost",
			"tauri://localhost",
		],
		allowHeaders: ["Content-Type", "X-Deep-Token"],
		allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	}),
);

app.get("/health", (c) =>
	c.json({
		ok: true,
		timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
	}),
);

// The Deep browser extension asks for the key here. Web pages can't fake the
// Origin header (Chrome sends it on POST), so only the extension with our fixed ID gets it.
app.post("/pair", (c) => {
	if (c.req.header("origin") !== `chrome-extension://${EXTENSION_ID}`)
		throw new HTTPException(403, {
			message: "Only the Deep extension can pair.",
		});
	return c.json({ token: TOKEN });
});

// Every API call must carry the local token, so other web pages can't drive the timer.
app.use("/api/*", async (c, next) => {
	if (TOKEN && c.req.header("x-deep-token") !== TOKEN) {
		throw new HTTPException(401, { message: "Missing or wrong X-Deep-Token." });
	}
	await next();
});

app.route("/api/projects", projectsRouter);
app.route("/api/tasks", tasksRouter);
app.route("/api/session", sessionRouter);
app.route("/api/captures", capturesRouter);
app.route("/api/day", dayRouter);
app.route("/api/stats", statsRouter);
app.route("/api/ai", aiRouter);
app.route("/api/activity", activityRouter);
app.route("/api/settings", settingsRouter);
app.route("/api/reviews", reviewsRouter);
app.route("/api/browser", browserRouter);
app.route("/api/calendars", calendarsRouter);
app.route("/api", exportsRouter);

const DOCKER_DESKTOP = "C:/Program Files/Docker/Docker/Docker Desktop.exe";

async function dockerStart(): Promise<boolean> {
	const proc = Bun.spawn(["docker", "start", "deep_postgres"], {
		stdout: "ignore",
		stderr: "ignore",
		windowsHide: true,
	});
	return (await proc.exited) === 0;
}

/**
 * Wait for Postgres, starting the Docker container if it's down. At login Docker
 * Desktop may still be starting (or not running at all), so keep trying for a while.
 */
async function waitForDatabase() {
	const deadline = Date.now() + 10 * 60_000;
	let nextDockerTry = 0;
	let launchedDesktop = false;
	while (true) {
		try {
			await sql`select 1`;
			return;
		} catch (err) {
			if (Date.now() >= nextDockerTry) {
				nextDockerTry = Date.now() + 15_000;
				console.log("[api] database not reachable, starting deep_postgres…");
				const ok = await dockerStart().catch(() => false);
				if (!ok && !launchedDesktop && existsSync(DOCKER_DESKTOP)) {
					launchedDesktop = true;
					console.log("[api] Docker isn't running, starting Docker Desktop…");
					Bun.spawn([DOCKER_DESKTOP], {
						stdout: "ignore",
						stderr: "ignore",
					}).unref();
				}
			}
			if (Date.now() > deadline) throw err;
			await Bun.sleep(2000);
		}
	}
}

/** The VS Code extension reads this to find the API and token. */
function writeConnectionFile() {
	const dir = join(homedir(), ".deep");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "connection.json"),
		JSON.stringify({ url: `http://127.0.0.1:${PORT}`, token: TOKEN }, null, 2),
	);
}

await waitForDatabase();
await runMigrations();
// A test instance (DEEP_TEST=1, its own database and port) must not touch the
// real connection file, pause real sessions, or write backups.
if (!process.env.DEEP_TEST) {
	writeConnectionFile();
	startIdleWatcher();
	startBackupJob();
	startCalendarJob();
	startWindowWatcher();
} else {
	// Test-only hooks to feed the window tracker fake samples.
	const { testingRouter } = await import("./routes/testing");
	app.route("/api/test", testingRouter);
}

type SocketData = { kind: "live" } | CoachSocketData;

Bun.serve<SocketData, never>({
	hostname: "127.0.0.1",
	port: PORT,
	idleTimeout: 120,
	fetch(req, server) {
		const url = new URL(req.url);
		if (url.pathname === "/ws" || url.pathname === "/coach") {
			if (TOKEN && url.searchParams.get("token") !== TOKEN) {
				return new Response("Unauthorized", { status: 401 });
			}
			let data: SocketData = { kind: "live" };
			if (url.pathname === "/coach") {
				const mode = parseCoachMode(url.searchParams.get("mode"));
				if (!mode) return new Response("Unknown coach mode", { status: 400 });
				data = { kind: "coach", mode };
			}
			if (server.upgrade(req, { data })) return undefined;
			return new Response("Expected a WebSocket upgrade", { status: 400 });
		}
		return app.fetch(req, server);
	},
	websocket: {
		async open(ws) {
			if (ws.data.kind === "coach") {
				const call = new CoachCall(
					ws as ServerWebSocket<CoachSocketData>,
					ws.data.mode,
				);
				ws.data.call = call;
				await call.start();
				return;
			}
			addClient(ws);
			ws.send(JSON.stringify({ type: "state", state: await buildState() }));
		},
		message(ws, msg) {
			if (ws.data.kind !== "coach") return;
			if (typeof msg === "string") {
				try {
					const m = JSON.parse(msg) as { type: string; text?: string };
					if (m.type === "text" && m.text) ws.data.call?.text(m.text);
					if (m.type === "hangup") ws.data.call?.finish("hangup");
				} catch {
					// ignore malformed messages
				}
			} else ws.data.call?.audio(msg);
		},
		close(ws) {
			if (ws.data.kind === "coach") ws.data.call?.finish("hangup");
			else removeClient(ws);
		},
	},
});

console.log(`[api] Deep API listening on http://127.0.0.1:${PORT}`);

// Idle sockets (the browser extension's service worker) stay awake on traffic.
setInterval(() => broadcast({ type: "ping" }), 25_000);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
	process.on(sig, () => {
		stopWhisper();
		process.exit(0);
	});
}
