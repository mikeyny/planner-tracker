/**
 * Demo data for recording the walkthrough video. Wipes the database first.
 *   bun run seed:demo morning   projects, history, inbox, a leftover from yesterday
 *   bun run seed:demo midday    today's plan with finished sessions, captures, timeline
 *   bun run seed:demo active    + a focus session that started 27 minutes ago
 *   bun run seed:demo reset     empty database
 */
import {
	captures,
	dayPlans,
	db,
	projectPaths,
	projects,
	sessionPauses,
	sessions,
	sql,
	tasks,
	timeBlocks,
} from "@deep/db";
import { localDate } from "@deep/shared";

const phase = process.argv[2] ?? "midday";
const today = localDate();
const at = (hhmm: string, date = today) =>
	new Date(`${date}T${hhmm}:00`).toISOString();
const daysAgo = (n: number) => {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return localDate(d);
};
const min = (m: number) => m * 60;

// This wipes the database. Only a *_test database is fair game without asking.
const dbName = new URL(
	process.env.DATABASE_URL ?? "postgres://x/deep",
).pathname.slice(1);
if (!dbName.endsWith("_test") && !process.argv.includes("--yes")) {
	console.error(
		`Refusing to wipe the "${dbName}" database. Point DATABASE_URL at a *_test database, or add --yes if you really mean it.`,
	);
	process.exit(1);
}

await sql`TRUNCATE projects, project_paths, tasks, day_plans, time_blocks, sessions, session_pauses, captures, activity_events, ai_runs, settings, reviews, window_spans, calendars RESTART IDENTITY CASCADE`;
if (phase === "reset") {
	console.log("database emptied");
	process.exit(0);
}

const root = "c:/users/nyama/documents/dev/techvest";
const [smp, cloud, agri, admin] = await db
	.insert(projects)
	.values([
		{
			name: "SMP",
			color: "#3987e5",
			weeklyTargetMin: 720,
			sortOrder: 1,
			leftOffNote:
				"Signature now built from the raw body. Next: test with the sandbox payload.",
			leftOffAt: at("10:35"),
		},
		{
			name: "Cloudlyte",
			color: "#d95926",
			client: "Cloudlyte",
			billable: true,
			hourlyRate: 45,
			weeklyTargetMin: 360,
			sortOrder: 2,
		},
		{
			name: "Agri-ledger",
			color: "#199e70",
			client: "Agri-ledger",
			billable: true,
			hourlyRate: 40,
			weeklyTargetMin: 360,
			sortOrder: 3,
		},
		{ name: "Admin", color: "#9085e9", sortOrder: 4 },
	])
	.returning();
await db.insert(projectPaths).values([
	{ projectId: smp!.id, path: `${root}/smp` },
	{ projectId: cloud!.id, path: `${root}/cloudlyte` },
	{ projectId: agri!.id, path: `${root}/agri-ledger` },
]);

/* History: finished tasks with tracked time, so estimate multipliers exist. */
const history: [number, string, number, number, number][] = [
	// projectId, title, estimate, actual minutes, days ago
	[smp!.id, "Order status polling job", 60, 95, 6],
	[smp!.id, "Refill status endpoint", 45, 70, 5],
	[smp!.id, "Deposit recovery nudge", 30, 50, 3],
	[cloud!.id, "Pricing page copy", 60, 70, 4],
	[cloud!.id, "Contact form worker", 45, 55, 2],
	[cloud!.id, "Sitemap and OG images", 30, 36, 1],
	[agri!.id, "Offline sync for field notes", 90, 120, 4],
	[agri!.id, "Invoice PDF layout", 45, 58, 2],
	[agri!.id, "Farmer import CSV", 60, 75, 1],
];
let order = 1;
for (const [projectId, title, est, actual, ago] of history) {
	const date = daysAgo(ago);
	const [t] = await db
		.insert(tasks)
		.values({
			projectId,
			title,
			estimateMin: est,
			status: "done",
			plannedFor: date,
			doneAt: at("16:00", date),
			sortOrder: order++,
		})
		.returning();
	await db.insert(sessions).values({
		kind: "focus",
		mode: "deep50",
		projectId,
		taskId: t!.id,
		plannedSec: min(50),
		startedAt: at("10:00", date),
		endedAt: new Date(
			Date.parse(at("10:00", date)) + min(actual) * 1000,
		).toISOString(),
		activeSec: min(actual),
		outcome: "done",
	});
}

/*
 * Four weeks of focus history for the weekly dashboard and heatmap.
 * Deterministic: mornings are strongest, Friday afternoons weakest.
 */
if (phase !== "morning") {
	let seed = 7;
	const rand = () => {
		seed = (seed * 16807) % 2147483647;
		return seed / 2147483647;
	};
	const pool = [
		{ projectId: smp!.id, title: "Paynow integration", energy: "deep" },
		{ projectId: cloud!.id, title: "Landing page sections", energy: "deep" },
		{ projectId: agri!.id, title: "Client emails", energy: "shallow" },
		{ projectId: admin!.id, title: "Invoices and admin", energy: "admin" },
	];
	const poolTasks = await db
		.insert(tasks)
		.values(
			pool.map((p) => ({
				projectId: p.projectId,
				title: p.title,
				energy: p.energy,
				status: "done",
				doneAt: at("17:00", daysAgo(1)),
				sortOrder: order++,
			})),
		)
		.returning();
	const slots = [
		{ start: "08:45", min: 50, weight: [0.55, 0.3, 0.1, 0.05], rating: 4.5 },
		{ start: "09:45", min: 50, weight: [0.5, 0.35, 0.1, 0.05], rating: 4.4 },
		{ start: "11:00", min: 45, weight: [0.3, 0.4, 0.2, 0.1], rating: 3.8 },
		{ start: "14:00", min: 40, weight: [0.25, 0.35, 0.3, 0.1], rating: 3.2 },
		{ start: "15:30", min: 30, weight: [0.15, 0.2, 0.35, 0.3], rating: 2.6 },
	];
	const pick = (w: number[]) => {
		let r = rand();
		for (let i = 0; i < w.length; i++) {
			r -= w[i]!;
			if (r <= 0) return i;
		}
		return w.length - 1;
	};
	const rows: (typeof sessions.$inferInsert)[] = [];
	for (let ago = 27; ago >= 1; ago--) {
		const date = daysAgo(ago);
		const dow = new Date(`${date}T12:00:00`).getDay();
		if (dow === 0 || dow === 6) continue;
		for (const slot of slots) {
			if (rand() < (dow === 5 && slot.start >= "14:00" ? 0.6 : 0.2)) continue; // skipped block
			const i = pick(slot.weight);
			const minutes = Math.round(slot.min * (0.7 + rand() * 0.35));
			const startedAt = at(slot.start, date);
			const rating = Math.max(
				1,
				Math.min(
					5,
					Math.round(
						slot.rating + (rand() - 0.5) * 1.6 - (dow === 5 ? 0.6 : 0),
					),
				),
			);
			rows.push({
				kind: "focus",
				mode: "deep50",
				projectId: pool[i]!.projectId,
				taskId: poolTasks[i]!.id,
				plannedSec: min(slot.min),
				startedAt,
				endedAt: new Date(
					Date.parse(startedAt) + min(minutes) * 1000,
				).toISOString(),
				activeSec: min(minutes),
				outcome: "progress",
				focusRating: rating,
			});
		}
	}
	await db.insert(sessions).values(rows);
	// Distractions cluster after lunch.
	const notes = [
		"WhatsApp",
		"Email",
		"WhatsApp",
		"News",
		"WhatsApp",
		"Twitter",
	];
	const caps: (typeof captures.$inferInsert)[] = [];
	for (let ago = 13; ago >= 1; ago--) {
		const date = daysAgo(ago);
		const dow = new Date(`${date}T12:00:00`).getDay();
		if (dow === 0 || dow === 6) continue;
		const n = 1 + Math.floor(rand() * 3);
		for (let k = 0; k < n; k++) {
			const hour =
				rand() < 0.65
					? 13 + Math.floor(rand() * 3)
					: 9 + Math.floor(rand() * 3);
			caps.push({
				kind: rand() < 0.8 ? "urge" : "interruption",
				text: rand() < 0.7 ? notes[Math.floor(rand() * notes.length)]! : "Urge",
				status: "triaged",
				createdAt: at(
					`${String(hour).padStart(2, "0")}:${String(Math.floor(rand() * 60)).padStart(2, "0")}`,
					date,
				),
			});
		}
	}
	await db.insert(captures).values(caps);
}

/* Inbox and a leftover from yesterday. */
await db.insert(tasks).values([
	{
		projectId: smp!.id,
		title: "Refactor auth middleware",
		estimateMin: 150,
		energy: "deep",
		rolloverCount: 3,
		sortOrder: order++,
	},
	{
		projectId: cloud!.id,
		title: "Write the Cloudlyte case study",
		estimateMin: 60,
		energy: "deep",
		sortOrder: order++,
	},
	{
		projectId: admin!.id,
		title: "Update the invoice template",
		estimateMin: 20,
		energy: "admin",
		sortOrder: order++,
	},
	{
		projectId: agri!.id,
		title: "Answer Tendai's question about exports",
		estimateMin: 15,
		energy: "shallow",
		plannedFor: phase === "morning" ? daysAgo(1) : today,
		rolloverCount: 1,
		sortOrder: order++,
	},
]);

if (phase === "morning") {
	console.log("morning seeded");
	process.exit(0);
}

/* Today. */
const [webhook, hero, invoice] = await db
	.insert(tasks)
	.values([
		{
			projectId: smp!.id,
			title: "Finish Paynow payment webhook",
			estimateMin: 150,
			energy: "deep",
			isTop3: true,
			plannedFor: today,
			nextAction: "Write the failing signature test",
			sortOrder: 1,
		},
		{
			projectId: cloud!.id,
			title: "Build the new hero section",
			estimateMin: 90,
			energy: "deep",
			isTop3: true,
			plannedFor: today,
			nextAction: "Sketch the layout on paper",
			sortOrder: 2,
		},
		{
			projectId: agri!.id,
			title: "Reply to the client about the invoice",
			estimateMin: 15,
			energy: "shallow",
			isTop3: true,
			plannedFor: today,
			nextAction: "Open the email thread",
			sortOrder: 3,
		},
		{
			projectId: admin!.id,
			title: "Renew the domain",
			estimateMin: 10,
			energy: "admin",
			plannedFor: today,
			dueDate: daysAgo(-1),
			sortOrder: 4,
		},
		{
			projectId: cloud!.id,
			title: "Fix the footer links",
			estimateMin: 20,
			energy: "shallow",
			plannedFor: today,
			sortOrder: 5,
		},
	])
	.returning();
const [alerts, pr] = await db
	.insert(tasks)
	.values([
		{
			projectId: smp!.id,
			title: "Check overnight error alerts",
			estimateMin: 10,
			status: "done",
			plannedFor: today,
			doneAt: at("08:42"),
			sortOrder: 6,
		},
		{
			projectId: agri!.id,
			title: "Review Tafadzwa's PR",
			estimateMin: 30,
			status: "done",
			plannedFor: today,
			doneAt: at("11:22"),
			sortOrder: 7,
		},
	])
	.returning();

await db.insert(dayPlans).values({
	date: today,
	startedAt: at("08:35"),
	intention: "the webhook ships",
});

const focus = (
	taskId: number,
	projectId: number,
	start: string,
	end: string,
	outcome: string,
	note: string | null = null,
) => {
	const s = Date.parse(at(start));
	const e = Date.parse(at(end));
	return {
		kind: "focus",
		mode: "deep50",
		projectId,
		taskId,
		plannedSec: min(50),
		startedAt: at(start),
		endedAt: at(end),
		activeSec: Math.round((e - s) / 1000),
		outcome,
		leftOffNote: note,
		intention: null,
	};
};
const [s1] = await db
	.insert(sessions)
	.values([
		focus(alerts!.id, smp!.id, "08:36", "08:42", "done"),
		focus(
			webhook!.id,
			smp!.id,
			"08:45",
			"09:35",
			"progress",
			"Handler parses the callback. Next: verify the hash.",
		),
		focus(
			webhook!.id,
			smp!.id,
			"09:45",
			"10:35",
			"progress",
			"Signature now built from the raw body. Next: test with the sandbox payload.",
		),
		focus(pr!.id, agri!.id, "10:45", "11:22", "done"),
	])
	.returning();
await db.insert(sessions).values({
	kind: "break",
	mode: "deep50",
	plannedSec: min(10),
	startedAt: at("09:35"),
	endedAt: at("09:45"),
	activeSec: min(10),
});
void s1;

await db.insert(captures).values([
	{
		text: "Webhook retries need a backoff",
		kind: "parking",
		projectId: smp!.id,
		createdAt: at("09:20"),
	},
	{
		text: "Ask Tendai about staging DB access",
		kind: "parking",
		projectId: agri!.id,
		createdAt: at("10:58"),
	},
	{ text: "Urge", kind: "urge", status: "triaged", createdAt: at("09:12") },
	{ text: "Urge", kind: "urge", status: "triaged", createdAt: at("10:05") },
	{
		text: "Interruption",
		kind: "interruption",
		status: "triaged",
		createdAt: at("10:20"),
	},
]);

const hm = (h: string) => {
	const [a, b] = h.split(":").map(Number);
	return a! * 60 + b!;
};
await db.insert(timeBlocks).values([
	{
		date: today,
		taskId: webhook!.id,
		projectId: smp!.id,
		title: "Finish Paynow payment webhook",
		startMin: hm("08:45"),
		durationMin: 110,
		kind: "task",
	},
	{
		date: today,
		taskId: pr!.id,
		projectId: agri!.id,
		title: "Review Tafadzwa's PR",
		startMin: hm("10:45"),
		durationMin: 40,
		kind: "task",
	},
	{
		date: today,
		taskId: hero!.id,
		projectId: cloud!.id,
		title: "Build the new hero section",
		startMin: hm("12:30"),
		durationMin: 90,
		kind: "task",
	},
	{
		date: today,
		taskId: null,
		projectId: null,
		title: "Call with Tendai",
		startMin: hm("14:00"),
		durationMin: 30,
		kind: "meeting",
	},
	{
		date: today,
		taskId: webhook!.id,
		projectId: smp!.id,
		title: "Webhook: sandbox tests",
		startMin: hm("14:30"),
		durationMin: 60,
		kind: "task",
	},
	{
		date: today,
		taskId: invoice!.id,
		projectId: agri!.id,
		title: "Reply to the client about the invoice",
		startMin: hm("15:30"),
		durationMin: 15,
		kind: "task",
	},
	{
		date: today,
		taskId: null,
		projectId: null,
		title: "Shutdown",
		startMin: hm("17:30"),
		durationMin: 15,
		kind: "break",
	},
]);

if (phase === "active") {
	const started = new Date(Date.now() - min(27) * 1000).toISOString();
	const [live] = await db
		.insert(sessions)
		.values({
			kind: "focus",
			mode: "deep50",
			projectId: smp!.id,
			taskId: webhook!.id,
			plannedSec: min(50),
			startedAt: started,
			intention: "get the sandbox payload test passing",
		})
		.returning();
	void live;
	void sessionPauses;
}

console.log(`${phase} seeded`);
process.exit(0);
