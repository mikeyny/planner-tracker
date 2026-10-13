import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
	allowSite,
	browserState,
	browserStatus,
	reportTab,
	siteBlocked,
} from "../lib/browser";

const site = z.string().trim().toLowerCase().min(3).max(200);

export const browserRouter = new Hono()
	.get("/state", async (c) => c.json(await browserState()))
	.get("/status", (c) => c.json(browserStatus()))
	.post(
		"/heartbeat",
		zValidator(
			"json",
			z.object({
				domain: z.string().max(300).nullable(),
				title: z.string().max(400).nullable(),
				focused: z.boolean(),
			}),
		),
		(c) => {
			reportTab(c.req.valid("json"));
			return c.json({ ok: true });
		},
	)
	.post(
		"/allow",
		zValidator(
			"json",
			z.object({
				site,
				minutes: z.number().int().min(1).max(30),
				reason: z.string().trim().max(200).nullable().optional(),
			}),
		),
		async (c) => {
			const { site, minutes, reason } = c.req.valid("json");
			await allowSite(site, minutes, reason || null);
			return c.json(await browserState());
		},
	)
	.post("/blocked", zValidator("json", z.object({ site })), async (c) =>
		c.json({ logged: await siteBlocked(c.req.valid("json").site) }),
	);
