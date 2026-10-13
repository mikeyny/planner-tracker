import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { changed } from "../lib/bus";
import { getSettings, updateSettings } from "../lib/settings";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

const settingsInput = z
	.object({
		dailyTargetMin: z.number().int().min(15).max(720),
		defaultMode: z.enum([
			"pomodoro",
			"deep50",
			"deep90",
			"flowtime",
			"timebox",
			"just5",
		]),
		timeboxMin: z.number().int().min(5).max(480),
		workdayStart: hhmm,
		shutdownTime: hhmm,
		idlePauseMin: z.number().int().min(1).max(120),
		idleEndMin: z.number().int().min(2).max(240),
		vscodeStart: z.enum(["ask", "auto", "off"]),
		vscodeClosePause: z.boolean(),
		vscodeSwitchPrompt: z.boolean(),
		chimeEvery15: z.boolean(),
		autoMiniTimer: z.boolean(),
		notifications: z.boolean(),
		sound: z.enum(["off", "brown", "pink", "rain"]),
		soundVolume: z.number().min(0).max(1),
		speechLanguage: z.string().min(2).max(8),
		projectsRoot: z.string().max(500),
		backupsKeep: z.number().int().min(1).max(365),
		windowTracking: z.boolean(),
		windowRetentionDays: z.number().int().min(1).max(365),
		distracting: z.array(z.string().trim().min(1).max(200)).max(200),
		driftNudge: z.boolean(),
		blockSites: z.boolean(),
		coachCheckins: z.enum(["off", "start", "both"]),
		coachVoice: z.string().min(2).max(40),
	})
	.partial();

export const settingsRouter = new Hono()
	.get("/", async (c) => c.json(await getSettings()))
	.put("/", zValidator("json", settingsInput), async (c) => {
		const next = await updateSettings(c.req.valid("json"));
		changed("settings");
		return c.json(next);
	});
