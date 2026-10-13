import { type AppCategory, formatMinutes } from "@deep/shared";
import { useAppUsage, useSettings } from "../lib/queries";
import { setUi } from "../lib/ui";
import { cx, SectionLabel } from "./ui";

export const CATEGORY: Record<AppCategory, { label: string; color: string }> = {
	work: { label: "Work", color: "#3987e5" },
	comms: { label: "Messages", color: "#c08a2e" },
	distraction: { label: "Distracting", color: "#e2456f" },
	other: { label: "Other", color: "#6f6a78" },
};

const min = (sec: number) => formatMinutes(Math.max(1, Math.round(sec / 60)));

/** "Where your time went": apps and sites from the window tracker. */
export function AppUsageCard({ date }: { date: string }) {
	const { data: usage } = useAppUsage(date);
	const { data: settings } = useSettings();
	if (!usage) return null;

	if (usage.totalSec < 60) {
		return (
			<section className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-4">
				<SectionLabel>Where your time went</SectionLabel>
				<p className="text-[13px] text-muted">
					{settings?.windowTracking === false ? (
						<>
							Window tracking is off.{" "}
							<button
								type="button"
								className="text-fg underline underline-offset-2 cursor-pointer"
								onClick={() => setUi({ view: "settings" })}
							>
								Turn it on in Settings
							</button>{" "}
							to see which apps and sites take your day.
						</>
					) : (
						"Nothing recorded yet today. Deep notes which app and site is in front every few seconds, on this PC only."
					)}
				</p>
			</section>
		);
	}

	const cats = (Object.keys(CATEGORY) as AppCategory[]).filter(
		(c) => usage.byCategory[c] > 0,
	);
	const maxSec = Math.max(1, ...usage.items.map((i) => i.sec));
	const offTask = usage.items.filter(
		(i) => i.category === "distraction" && i.focusSec > 0,
	);
	const focusPct = usage.focusSec
		? Math.round(((usage.focusSec - usage.offTaskSec) / usage.focusSec) * 100)
		: null;

	return (
		<section className="flex flex-col gap-4 rounded-[14px] border border-line bg-surface p-4">
			<div className="flex items-baseline justify-between">
				<SectionLabel>Where your time went</SectionLabel>
				<span className="font-mono text-[11px] text-muted">
					{min(usage.totalSec)} at the screen
				</span>
			</div>

			<div>
				<div className="flex h-3 overflow-hidden rounded-full bg-bg">
					{cats.map((c) => (
						<div
							key={c}
							title={`${CATEGORY[c].label}: ${min(usage.byCategory[c])}`}
							style={{
								width: `${(usage.byCategory[c] / usage.totalSec) * 100}%`,
								background: CATEGORY[c].color,
							}}
						/>
					))}
				</div>
				<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
					{cats.map((c) => (
						<span key={c} className="flex items-center gap-1.5">
							<span
								className="size-2 rounded-full"
								style={{ background: CATEGORY[c].color }}
							/>
							{CATEGORY[c].label}{" "}
							<span className="font-mono text-fg">
								{min(usage.byCategory[c])}
							</span>
						</span>
					))}
				</div>
			</div>

			{usage.focusSec >= 60 && (
				<div className="grid grid-cols-3 gap-3 rounded-[11px] bg-bg px-3.5 py-3 text-[12px]">
					<div>
						<div className="text-muted">On task during focus</div>
						<div
							className={cx(
								"font-display text-[20px] font-extrabold tabular",
								focusPct !== null && focusPct < 85 && "text-warn",
							)}
						>
							{focusPct}%
						</div>
						{offTask.length > 0 && (
							<div className="truncate text-[11px] text-muted">
								Off:{" "}
								{offTask.map((i) => `${i.label} ${min(i.focusSec)}`).join(", ")}
							</div>
						)}
					</div>
					<div>
						<div className="text-muted">Longest unbroken</div>
						<div className="font-display text-[20px] font-extrabold tabular">
							{min(usage.longestWorkSec)}
						</div>
						<div className="text-[11px] text-muted">on work apps</div>
					</div>
					<div>
						<div className="text-muted">Switches per hour</div>
						<div className="font-display text-[20px] font-extrabold tabular">
							{usage.switchesPerHour ?? "–"}
						</div>
						<div className="text-[11px] text-muted">while focusing</div>
					</div>
				</div>
			)}

			<div className="flex flex-col gap-1.5">
				{usage.items.map((i) => (
					<div
						key={i.label}
						className="grid grid-cols-[150px_minmax(0,1fr)_54px] items-center gap-3 text-[12.5px]"
					>
						<span
							className="truncate"
							title={i.site ? `${i.site} in ${i.app}` : i.app}
						>
							{i.label}
						</span>
						<div className="h-2.5">
							<div
								className="h-full rounded-r-[4px]"
								style={{
									width: `${(i.sec / maxSec) * 100}%`,
									background: CATEGORY[i.category].color,
								}}
							/>
						</div>
						<span className="text-right font-mono text-[11px] tabular">
							{min(i.sec)}
						</span>
					</div>
				))}
			</div>
		</section>
	);
}
