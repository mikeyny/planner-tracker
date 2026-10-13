import { localDate } from "@deep/shared";
import { Hono } from "hono";
import { heatmapFor, weekStatsFor } from "../lib/insights";
import { dayStats, multipliers } from "../lib/stats";
import { usageFor } from "../lib/usage";

export const statsRouter = new Hono()
	.get("/day", async (c) =>
		c.json(await dayStats(c.req.query("date") ?? localDate())),
	)
	/** Apps and sites from the window tracker for ?date=. */
	.get("/apps", async (c) =>
		c.json(await usageFor(c.req.query("date") ?? localDate())),
	)
	.get("/multipliers", async (c) => c.json(await multipliers()))
	/** Week containing ?date= (defaults to this week). */
	.get("/week", async (c) =>
		c.json(await weekStatsFor(c.req.query("date") ?? localDate())),
	)
	.get("/heatmap", async (c) => {
		const weeks = Math.min(12, Math.max(1, Number(c.req.query("weeks") ?? 4)));
		return c.json(await heatmapFor(weeks));
	});
