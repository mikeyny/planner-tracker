import { localDate } from "@deep/shared";
import { Hono } from "hono";
import { dayStats, multipliers } from "../lib/stats";

export const statsRouter = new Hono()
	.get("/day", async (c) =>
		c.json(await dayStats(c.req.query("date") ?? localDate())),
	)
	.get("/multipliers", async (c) => c.json(await multipliers()));
