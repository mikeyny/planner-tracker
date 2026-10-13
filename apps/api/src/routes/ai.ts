import { db, tasks } from "@deep/db";
import { type AiStatus, localDate } from "@deep/shared";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
	AiError,
	extractTasks,
	geminiAvailable,
	geminiModel,
	interpretCommand,
	naiveExtract,
} from "../lib/ai";
import { getSettings } from "../lib/settings";
import { projectNames } from "../lib/stats";
import {
	ensureWhisper,
	transcribe,
	whisperBackend,
	whisperModelName,
	whisperStatus,
} from "../lib/whisper";

export const aiRouter = new Hono()
	.get("/status", (c) => {
		const status: AiStatus = {
			gemini: geminiAvailable(),
			model: geminiModel(),
			whisper: whisperStatus(),
			whisperModel: whisperModelName(),
			whisperBackend: whisperBackend(),
		};
		return c.json(status);
	})
	/** Load the speech model ahead of time (called when the mic screen opens). */
	.post("/warmup", async (c) => {
		ensureWhisper().catch((err) =>
			console.error("[whisper] warmup failed:", err),
		);
		return c.json({ ok: true, whisper: whisperStatus() });
	})
	.post("/transcribe", async (c) => {
		const body = await c.req.parseBody();
		const file = body.file;
		if (!(file instanceof Blob))
			throw new HTTPException(400, { message: "Send audio as 'file'." });
		const settings = await getSettings();
		const names = (await projectNames()).map((p) => p.name);
		// Earlier text from the same recording keeps spelling consistent across chunks.
		const context =
			typeof body.context === "string" ? body.context.slice(-400) : "";
		const prompt = [
			names.length ? `Projects: ${names.join(", ")}.` : "",
			context,
		]
			.filter(Boolean)
			.join(" ");
		try {
			const started = Date.now();
			const text = await transcribe(file, {
				language:
					settings.speechLanguage === "auto" ? "auto" : settings.speechLanguage,
				prompt,
			});
			return c.json({ text, ms: Date.now() - started });
		} catch (err) {
			throw new HTTPException(503, {
				message: err instanceof Error ? err.message : "Transcription failed.",
			});
		}
	})
	.post(
		"/extract",
		zValidator(
			"json",
			z.object({ text: z.string().trim().min(1).max(20_000) }),
		),
		async (c) => {
			const { text } = c.req.valid("json");
			const projects = await projectNames();
			try {
				return c.json(await extractTasks(text, projects, localDate()));
			} catch (err) {
				// Never lose the user's words: fall back to a basic split.
				console.error("[ai] extract failed:", err);
				return c.json({
					tasks: naiveExtract(text, projects),
					ai: false,
					error: err instanceof AiError ? err.message : "AI request failed.",
				});
			}
		},
	)
	.post(
		"/command",
		zValidator("json", z.object({ text: z.string().trim().min(1).max(1000) })),
		async (c) => {
			if (!geminiAvailable())
				throw new HTTPException(503, {
					message: "Add a Gemini API key in .env to use AI commands.",
				});
			const open = await db.query.tasks.findMany({
				where: eq(tasks.status, "open"),
				limit: 80,
			});
			try {
				return c.json(
					await interpretCommand(c.req.valid("json").text, {
						projects: await projectNames(),
						tasks: open.map((t) => ({
							id: t.id,
							title: t.title,
							projectId: t.projectId,
						})),
					}),
				);
			} catch (err) {
				throw new HTTPException(502, {
					message: err instanceof AiError ? err.message : "AI request failed.",
				});
			}
		},
	);
