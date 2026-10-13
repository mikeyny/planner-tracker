import {
	type CalendarFeed,
	COACH_VOICES,
	DEFAULT_DISTRACTING,
	type Settings,
} from "@deep/shared";
import {
	CalendarPlus,
	Copy,
	FolderOpen,
	Loader2,
	RefreshCw,
	RotateCcw,
	Trash2,
	X,
} from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useNow } from "../lib/hooks";
import { queryClient, useBrowserStatus, useCalendars } from "../lib/queries";
import { inTauri, openFolder } from "../lib/tauri";
import { attempt, toast } from "../lib/ui";
import { Group, NumberInput, Row, Status, Toggle } from "./SettingsParts";
import { Button, inputCls, Segmented } from "./ui";

type Set = <K extends keyof Settings>(k: K, v: Settings[K]) => void;

function ago(iso: string | null, now: number) {
	if (!iso) return "never";
	const min = Math.round((now - Date.parse(iso)) / 60_000);
	if (min < 1) return "just now";
	if (min < 60) return `${min} min ago`;
	const h = Math.round(min / 60);
	return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString();
}

/* ---------------- calendar ---------------- */

export function CalendarGroup() {
	const { data: feeds = [] } = useCalendars();
	const [url, setUrl] = useState("");
	const [busy, setBusy] = useState<"add" | "sync" | null>(null);
	const now = useNow(30_000);

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: ["calendar"] });
	const add = async () => {
		if (!url.trim()) return;
		setBusy("add");
		const feed = await attempt(() =>
			api.post<CalendarFeed>("/calendars", { url: url.trim() }),
		);
		setBusy(null);
		if (feed) {
			setUrl("");
			refresh();
			toast(
				feed.lastError
					? `Added ${feed.name}, but the sync failed: ${feed.lastError}`
					: `Added ${feed.name}: ${feed.eventCount} meeting${feed.eventCount === 1 ? "" : "s"} in the next two weeks`,
			);
		}
	};
	const sync = async () => {
		setBusy("sync");
		await attempt(() => api.post("/calendars/sync"));
		setBusy(null);
		refresh();
	};

	return (
		<Group title="Calendar">
			{feeds.map((f) => (
				<Row
					key={f.id}
					label={f.name}
					hint={
						f.lastError
							? f.lastError
							: `Synced ${ago(f.lastSyncAt, now)} · ${f.eventCount} meeting${f.eventCount === 1 ? "" : "s"} in the next two weeks`
					}
				>
					<span className="flex items-center gap-3">
						{f.lastError && <Status ok={false} text="Sync failed" />}
						<Toggle
							value={f.enabled}
							onChange={async (enabled) => {
								await attempt(() =>
									api.patch(`/calendars/${f.id}`, { enabled }),
								);
								refresh();
							}}
						/>
						<button
							type="button"
							aria-label={`Remove ${f.name}`}
							title="Remove this calendar"
							className="grid size-7 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg cursor-pointer"
							onClick={async () => {
								await attempt(() => api.del(`/calendars/${f.id}`));
								refresh();
							}}
						>
							<Trash2 size={14} />
						</button>
					</span>
				</Row>
			))}
			<div className="flex flex-col gap-2 px-4 py-3">
				<div className="text-[13.5px]">
					{feeds.length
						? "Add another calendar"
						: "Show your meetings on Today"}
				</div>
				<div className="text-[11.5px] text-muted">
					In Google Calendar open Settings, pick your calendar, then copy{" "}
					<b className="font-semibold text-fg">Secret address in iCal format</b>{" "}
					(under “Integrate calendar”). Deep only reads it: meetings block time
					on the timeline and in your capacity. It syncs every 10 minutes and
					keeps working offline with the last copy.
				</div>
				<form
					className="flex gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						add();
					}}
				>
					<input
						aria-label="Calendar address"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
						className={`${inputCls} h-8 flex-1 font-mono text-[12px]`}
					/>
					<Button size="sm" type="submit" disabled={!url.trim() || !!busy}>
						{busy === "add" ? (
							<Loader2 size={13} className="animate-spin" />
						) : (
							<CalendarPlus size={13} />
						)}{" "}
						Add calendar
					</Button>
					{feeds.length > 0 && (
						<Button size="sm" tone="quiet" onClick={sync} disabled={!!busy}>
							<RefreshCw
								size={13}
								className={busy === "sync" ? "animate-spin" : ""}
							/>{" "}
							Sync now
						</Button>
					)}
				</form>
			</div>
		</Group>
	);
}

/* ---------------- distractions ---------------- */

export function DistractionsGroup({ s, set }: { s: Settings; set: Set }) {
	const [entry, setEntry] = useState("");
	const addEntry = () => {
		const v = entry
			.trim()
			.toLowerCase()
			.replace(/^https?:\/\//, "")
			.replace(/^www\./, "")
			.replace(/\/.*$/, "");
		if (!v) return;
		if (!s.distracting.includes(v)) set("distracting", [...s.distracting, v]);
		setEntry("");
	};
	const isDefault =
		s.distracting.length === DEFAULT_DISTRACTING.length &&
		s.distracting.every((d) => DEFAULT_DISTRACTING.includes(d));

	return (
		<Group title="Distractions">
			<Row
				label="Track which app and site is in front"
				hint="Every 5 seconds, stored only on this PC. Powers “Where your time went” on Stats."
			>
				<Toggle
					value={s.windowTracking}
					onChange={(v) => set("windowTracking", v)}
				/>
			</Row>
			<Row
				label="Nudge me when I drift during focus"
				hint="After 30 seconds on a distracting app or site"
			>
				<Toggle value={s.driftNudge} onChange={(v) => set("driftNudge", v)} />
			</Row>
			<div className="flex flex-col gap-2 px-4 py-3">
				<div className="flex items-center justify-between">
					<div>
						<div className="text-[13.5px]">Distracting sites and apps</div>
						<div className="text-[11.5px] text-muted">
							Domains (youtube.com) are blocked by the browser extension during
							focus. App names (steam, spotify) count as drift.
						</div>
					</div>
					{!isDefault && (
						<Button
							size="sm"
							tone="quiet"
							onClick={() => set("distracting", DEFAULT_DISTRACTING)}
						>
							<RotateCcw size={12} /> Defaults
						</Button>
					)}
				</div>
				<div className="flex flex-wrap gap-1.5">
					{s.distracting.map((d) => (
						<span
							key={d}
							className="flex items-center gap-1 rounded-full border border-line bg-bg py-0.5 pr-1 pl-2.5 font-mono text-[11.5px]"
						>
							{d}
							<button
								type="button"
								aria-label={`Remove ${d}`}
								onClick={() =>
									set(
										"distracting",
										s.distracting.filter((x) => x !== d),
									)
								}
								className="grid size-4 place-items-center rounded-full text-faint hover:text-fg cursor-pointer"
							>
								<X size={10} />
							</button>
						</span>
					))}
					<form
						onSubmit={(e) => {
							e.preventDefault();
							addEntry();
						}}
					>
						<input
							aria-label="Add a distracting site or app"
							value={entry}
							onChange={(e) => setEntry(e.target.value)}
							onBlur={addEntry}
							placeholder="+ add"
							className="h-6 w-28 rounded-full border border-dashed border-line bg-transparent px-2.5 font-mono text-[11.5px] text-fg placeholder:text-faint focus:border-line-strong focus:outline-none"
						/>
					</form>
				</div>
			</div>
			<Row label="Keep window activity for">
				<NumberInput
					value={s.windowRetentionDays}
					min={1}
					suffix="days"
					onChange={(v) => set("windowRetentionDays", v)}
				/>
			</Row>
			<BrowserRows s={s} set={set} />
		</Group>
	);
}

function BrowserRows({ s, set }: { s: Settings; set: Set }) {
	const { data: status } = useBrowserStatus();
	const now = useNow(30_000);
	return (
		<>
			<Row
				label="Block distracting sites during focus"
				hint="Needs the Deep Focus Guard extension in Chrome or Edge"
			>
				<Toggle value={s.blockSites} onChange={(v) => set("blockSites", v)} />
			</Row>
			<div className="flex flex-col gap-2 px-4 py-3">
				<div className="flex items-center justify-between gap-4">
					<div className="text-[13.5px]">Browser extension</div>
					{status && (
						<Status
							ok={status.connected}
							text={
								status.connected
									? "Connected"
									: status.lastSeen
										? `Last seen ${ago(status.lastSeen, now)}`
										: "Not installed"
							}
						/>
					)}
				</div>
				{status && !status.connected && (
					<ol className="ml-4 list-decimal text-[12px] leading-relaxed text-muted">
						<li>
							In Chrome open{" "}
							<span className="font-mono text-fg">chrome://extensions</span> and
							switch on <b className="font-semibold">Developer mode</b> (top
							right).
						</li>
						<li>
							Click <b className="font-semibold">Load unpacked</b> and pick this
							folder:
						</li>
					</ol>
				)}
				{status && (
					<div className="flex items-center gap-2">
						<code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-bg px-2 py-1.5 font-mono text-[11.5px]">
							{status.folder}
						</code>
						<Button
							size="sm"
							tone="quiet"
							onClick={async () => {
								await navigator.clipboard.writeText(status.folder);
								toast("Folder path copied");
							}}
						>
							<Copy size={12} /> Copy
						</Button>
						{inTauri && (
							<Button
								size="sm"
								tone="quiet"
								onClick={() => openFolder(status.folder)}
							>
								<FolderOpen size={12} /> Open
							</Button>
						)}
					</div>
				)}
				{status && !status.connected && (
					<div className="text-[11.5px] text-faint">
						It connects to Deep on its own. Nothing is blocked while Deep is
						closed or between sessions.
					</div>
				)}
			</div>
		</>
	);
}

/* ---------------- coach ---------------- */

export function CoachRows({
	s,
	set,
	gemini,
}: {
	s: Settings;
	set: Set;
	gemini: boolean;
}) {
	return (
		<>
			<Row
				label="Voice check-ins"
				hint={
					gemini
						? "A short spoken check-in with the coach, like working next to someone"
						: "Needs a Gemini API key"
				}
			>
				<Segmented
					value={s.coachCheckins}
					onChange={(v) => set("coachCheckins", v)}
					options={[
						{ value: "off", label: "Off" },
						{ value: "start", label: "At start" },
						{ value: "both", label: "Start and end" },
					]}
				/>
			</Row>
			<Row label="Coach voice">
				<select
					className="h-8 rounded-lg border border-line bg-bg px-2 text-[13px]"
					value={s.coachVoice}
					onChange={(e) => set("coachVoice", e.target.value)}
				>
					{COACH_VOICES.map((v) => (
						<option key={v} value={v}>
							{v}
						</option>
					))}
				</select>
			</Row>
		</>
	);
}
