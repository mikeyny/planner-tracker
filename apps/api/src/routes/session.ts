import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
	EngineError,
	extendSession,
	pauseSession,
	resolveIdle,
	resumeSession,
	startBreak,
	startSession,
	stopSession,
} from "../lib/engine";
import { buildState } from "../lib/state";

const modes = z.enum([
	"pomodoro",
	"deep50",
	"deep90",
	"flowtime",
	"timebox",
	"just5",
]);

async function guard<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof EngineError)
			throw new HTTPException(409, { message: err.message });
		throw err;
	}
}

export const sessionRouter = new Hono()
	.get("/state", async (c) => c.json(await buildState()))
	.post(
		"/start",
		zValidator(
			"json",
			z.object({
				taskId: z.number().int().nullable().optional(),
				projectId: z.number().int().nullable().optional(),
				mode: modes.optional(),
				minutes: z.number().int().min(0).max(600).nullable().optional(),
				intention: z.string().max(300).nullable().optional(),
				source: z.enum(["manual", "vscode", "auto"]).optional(),
			}),
		),
		async (c) => {
			await guard(() => startSession(c.req.valid("json")));
			return c.json(await buildState());
		},
	)
	.post("/pause", async (c) => {
		await guard(() => pauseSession("manual"));
		return c.json(await buildState());
	})
	.post("/resume", async (c) => {
		await guard(() => resumeSession());
		return c.json(await buildState());
	})
	.post("/toggle", async (c) => {
		const state = await buildState();
		if (!state.session)
			throw new HTTPException(409, { message: "No session is running." });
		await guard(() =>
			state.session?.pausedAt ? resumeSession() : pauseSession("manual"),
		);
		return c.json(await buildState());
	})
	.post(
		"/stop",
		zValidator(
			"json",
			z.object({
				outcome: z.enum(["done", "progress", "blocked"]).nullable().optional(),
				leftOffNote: z.string().max(2000).nullable().optional(),
				focusRating: z.number().int().min(1).max(5).nullable().optional(),
			}),
		),
		async (c) => {
			const result = await guard(() => stopSession(c.req.valid("json")));
			return c.json({ ...result, state: await buildState() });
		},
	)
	.post(
		"/extend",
		zValidator("json", z.object({ minutes: z.number().min(1).max(240) })),
		async (c) => {
			await guard(() => extendSession(c.req.valid("json").minutes));
			return c.json(await buildState());
		},
	)
	.post(
		"/break",
		zValidator("json", z.object({ minutes: z.number().min(1).max(120) })),
		async (c) => {
			await guard(() => startBreak(c.req.valid("json").minutes));
			return c.json(await buildState());
		},
	)
	.post(
		"/idle",
		zValidator(
			"json",
			z.object({ action: z.enum(["keep", "break", "discard", "end"]) }),
		),
		async (c) => {
			await guard(() => resolveIdle(c.req.valid("json").action));
			return c.json(await buildState());
		},
	);
