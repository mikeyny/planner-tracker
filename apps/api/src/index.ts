import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { runMigrations, sql } from "@deep/db";
import type { ServerWebSocket } from "bun";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { addClient, removeClient } from "./lib/bus";
import { buildState } from "./lib/state";
import { startIdleWatcher } from "./lib/watchers";
import { stopWhisper } from "./lib/whisper";
import { activityRouter } from "./routes/activity";
import { aiRouter } from "./routes/ai";
import { capturesRouter } from "./routes/captures";
import { dayRouter } from "./routes/day";
import { projectsRouter } from "./routes/projects";
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
			"http://tauri.localhost",
			"tauri://localhost",
		],
		allowHeaders: ["Content-Type", "X-Deep-Token"],
		allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	}),
);

app.get("/health", (c) => c.json({ ok: true }));

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

/** Wait for Postgres, starting the Docker container if it's down. */
async function waitForDatabase() {
	const deadline = Date.now() + 120_000;
	let triedDocker = false;
	while (true) {
		try {
			await sql`select 1`;
			return;
		} catch (err) {
			if (!triedDocker) {
				triedDocker = true;
				console.log(
					"[api] database not reachable, starting container deep_postgres…",
				);
				Bun.spawn(["docker", "start", "deep_postgres"], {
					stdout: "ignore",
					stderr: "ignore",
					windowsHide: true,
				});
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
writeConnectionFile();
startIdleWatcher();

Bun.serve({
	hostname: "127.0.0.1",
	port: PORT,
	idleTimeout: 120,
	fetch(req, server) {
		const url = new URL(req.url);
		if (url.pathname === "/ws") {
			if (TOKEN && url.searchParams.get("token") !== TOKEN) {
				return new Response("Unauthorized", { status: 401 });
			}
			if (server.upgrade(req)) return undefined;
			return new Response("Expected a WebSocket upgrade", { status: 400 });
		}
		return app.fetch(req, server);
	},
	websocket: {
		async open(ws: ServerWebSocket<unknown>) {
			addClient(ws);
			ws.send(JSON.stringify({ type: "state", state: await buildState() }));
		},
		message() {},
		close(ws) {
			removeClient(ws);
		},
	},
});

console.log(`[api] Deep API listening on http://127.0.0.1:${PORT}`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
	process.on(sig, () => {
		stopWhisper();
		process.exit(0);
	});
}
