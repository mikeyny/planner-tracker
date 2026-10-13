import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { resetBrowser } from "../lib/browser";
import { endSpan, ingest, sampleOf } from "../lib/winwatch";

/** Only mounted when DEEP_TEST=1. */
export const testingRouter = new Hono()
	.post(
		"/window",
		zValidator(
			"json",
			z.object({
				exe: z.string(),
				title: z.string(),
				domain: z.string().nullable().optional(),
				at: z.string().optional(),
			}),
		),
		async (c) => {
			const { at, ...fg } = c.req.valid("json");
			const sample = await sampleOf(fg);
			await ingest(sample, at ? Date.parse(at) : Date.now());
			return c.json(sample);
		},
	)
	.post(
		"/window/end",
		zValidator("json", z.object({ at: z.string().optional() })),
		async (c) => {
			const { at } = c.req.valid("json");
			await endSpan(at ? Date.parse(at) : Date.now());
			return c.json({ ok: true });
		},
	)
	.post("/browser/reset", (c) => {
		resetBrowser();
		return c.json({ ok: true });
	});
