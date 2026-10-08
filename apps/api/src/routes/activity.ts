import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
	handleHeartbeat,
	handleVscodeClosed,
	vscodeWindows,
} from "../lib/watchers";

export const activityRouter = new Hono()
	.post(
		"/heartbeat",
		zValidator(
			"json",
			z.object({
				windowId: z.string().min(1).max(200),
				workspaces: z.array(z.string()).max(20),
				file: z.string().max(1000).nullable(),
				language: z.string().max(100).nullable(),
				branch: z.string().max(200).nullable(),
				focused: z.boolean(),
				editing: z.boolean(),
			}),
		),
		async (c) => c.json(await handleHeartbeat(c.req.valid("json"))),
	)
	.post(
		"/vscode-closed",
		zValidator("json", z.object({ windowId: z.string().min(1) })),
		async (c) => {
			await handleVscodeClosed(c.req.valid("json").windowId);
			return c.json({ ok: true });
		},
	)
	.get("/vscode", (c) => c.json(vscodeWindows()));
