import { db, windowSpans } from "@deep/db";
import { addDays } from "@deep/shared";
import { and, asc, gte, lt } from "drizzle-orm";
import { startOfLocalDay } from "./state";
import { summarizeUsage } from "./usage-core";

export async function usageFor(date: string) {
	const rows = await db.query.windowSpans.findMany({
		where: and(
			gte(windowSpans.startedAt, startOfLocalDay(date)),
			lt(windowSpans.startedAt, startOfLocalDay(addDays(date, 1))),
		),
		orderBy: asc(windowSpans.startedAt),
	});
	return summarizeUsage(date, rows);
}
