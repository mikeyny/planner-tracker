import {
	addDays,
	type DiscoveredProject,
	formatMinutes,
	localDate,
	mondayOf,
	type Project,
	type Timesheet,
} from "@deep/shared";
import { FileDown, FolderGit2, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { queryClient } from "../lib/queries";
import { inTauri, pickSavePath } from "../lib/tauri";
import { attempt, toast } from "../lib/ui";
import { Button, cx, inputCls, Modal, Segmented } from "./ui";

/* ---------------- Find projects ---------------- */

export function DiscoverDialog({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const [root, setRoot] = useState<string | null>(null);
	const [found, setFound] = useState<DiscoveredProject[] | null>(null);
	const [picked, setPicked] = useState<Set<string>>(new Set());
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (!open) return;
		setFound(null);
		setPicked(new Set());
		api
			.get<{ root: string; found: DiscoveredProject[] }>("/projects/discover")
			.then((r) => {
				setRoot(r.root);
				setFound(r.found);
			})
			.catch((e: Error) => {
				toast(e.message, "error");
				setFound([]);
			});
	}, [open]);

	const toggle = (path: string) => {
		const next = new Set(picked);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		setPicked(next);
	};

	const importPicked = async () => {
		if (!found) return;
		setBusy(true);
		const items = found
			.filter((f) => picked.has(f.path))
			.map((f) => ({ name: f.name, path: f.path }));
		const ok = await attempt(() =>
			api.post<Project[]>("/projects/import", { items }),
		);
		setBusy(false);
		if (ok) {
			queryClient.invalidateQueries({ queryKey: ["projects"] });
			toast(`Added ${ok.length} project${ok.length === 1 ? "" : "s"}`);
			onClose();
		}
	};

	return (
		<Modal open={open} onClose={onClose} title="Find projects" width={620}>
			<div className="flex flex-col gap-4">
				<p className="text-[13px] text-muted">
					Repos in{" "}
					<span className="font-mono text-[12px] text-fg">{root ?? "…"}</span>{" "}
					that aren't linked to a project yet. Change the folder in Settings.
				</p>
				{!found ? (
					<div className="flex items-center gap-2 py-6 text-muted">
						<Loader2 size={15} className="animate-spin" /> Looking for repos…
					</div>
				) : found.length === 0 ? (
					<div className="rounded-xl border border-dashed border-line px-5 py-6 text-center text-[13px] text-muted">
						Every repo there is already linked.
					</div>
				) : (
					<div className="flex max-h-[46vh] flex-col gap-1 overflow-y-auto">
						{found.map((f) => (
							<label
								key={f.path}
								className={cx(
									"flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2",
									picked.has(f.path)
										? "border-fg bg-raised"
										: "border-line hover:border-line-strong",
								)}
							>
								<input
									type="checkbox"
									checked={picked.has(f.path)}
									onChange={() => toggle(f.path)}
									className="size-4 accent-[#eceaf0]"
								/>
								<FolderGit2 size={15} className="text-muted" />
								<div className="min-w-0 flex-1">
									<div className="text-[13.5px] font-semibold">{f.name}</div>
									<div className="truncate font-mono text-[10.5px] text-muted">
										{f.path}
									</div>
								</div>
								<span className="text-[11px] text-faint">
									{new Date(f.modifiedAt).toLocaleDateString("en-GB", {
										day: "numeric",
										month: "short",
									})}
								</span>
							</label>
						))}
					</div>
				)}
				<div className="flex justify-end gap-2">
					<Button tone="quiet" onClick={onClose}>
						Cancel
					</Button>
					<Button
						tone="primary"
						disabled={picked.size === 0 || busy}
						onClick={importPicked}
					>
						Add {picked.size || ""} project{picked.size === 1 ? "" : "s"}
					</Button>
				</div>
			</div>
		</Modal>
	);
}

/* ---------------- Timesheets ---------------- */

type Preset = "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "custom";

function rangeFor(preset: Preset, custom: { from: string; to: string }) {
	const today = localDate();
	const monday = mondayOf(today);
	const d = new Date(`${today}T12:00:00`);
	const firstOfMonth = localDate(
		new Date(d.getFullYear(), d.getMonth(), 1, 12),
	);
	const firstOfLast = localDate(
		new Date(d.getFullYear(), d.getMonth() - 1, 1, 12),
	);
	switch (preset) {
		case "thisWeek":
			return { from: monday, to: today };
		case "lastWeek":
			return { from: addDays(monday, -7), to: addDays(monday, -1) };
		case "thisMonth":
			return { from: firstOfMonth, to: today };
		case "lastMonth":
			return { from: firstOfLast, to: addDays(firstOfMonth, -1) };
		default:
			return custom;
	}
}

/** Preview and export billable time. `project` null = all billable projects. */
export function TimesheetDialog({
	open,
	project,
	onClose,
}: {
	open: boolean;
	project: Project | null;
	onClose: () => void;
}) {
	const [preset, setPreset] = useState<Preset>("lastMonth");
	const [custom, setCustom] = useState({
		from: addDays(localDate(), -30),
		to: localDate(),
	});
	const [sheet, setSheet] = useState<Timesheet | null>(null);
	const [loading, setLoading] = useState(false);
	const [savePath, setSavePath] = useState("");
	const range = useMemo(() => rangeFor(preset, custom), [preset, custom]);
	const projectId = project?.id ?? null;

	useEffect(() => {
		if (!open) return;
		setLoading(true);
		const q = `from=${range.from}&to=${range.to}${projectId ? `&projectId=${projectId}` : ""}`;
		api
			.get<Timesheet>(`/timesheet?${q}`)
			.then(setSheet)
			.catch((e: Error) => toast(e.message, "error"))
			.finally(() => setLoading(false));
	}, [open, range, projectId]);

	const exportAs = async (format: "csv" | "pdf") => {
		const base = `timesheet-${(project?.name ?? "billable").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${range.from}-to-${range.to}.${format}`;
		// In the desktop app a save dialog picks the file; in a plain browser (tests) type a folder.
		const path = inTauri
			? await pickSavePath(base, format)
			: savePath
				? `${savePath.replace(/[\\/]+$/, "")}/${base}`
				: null;
		if (!path) return;
		const res = await attempt(() =>
			api.post<{ path: string; rows: number }>("/timesheet", {
				projectId,
				from: range.from,
				to: range.to,
				format,
				path,
			}),
		);
		if (res) toast(`Saved ${res.rows} rows to ${res.path}`);
	};

	const currency = (n: number | null) =>
		n === null
			? "–"
			: n.toLocaleString("en-US", {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				});

	return (
		<Modal
			open={open}
			onClose={onClose}
			title={`Timesheet · ${project?.name ?? "all billable projects"}`}
			width={760}
		>
			<div className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center gap-3">
					<Segmented
						value={preset}
						onChange={setPreset}
						options={[
							{ value: "thisWeek", label: "This week" },
							{ value: "lastWeek", label: "Last week" },
							{ value: "thisMonth", label: "This month" },
							{ value: "lastMonth", label: "Last month" },
							{ value: "custom", label: "Custom" },
						]}
					/>
					{preset === "custom" ? (
						<span className="flex items-center gap-2 text-[12px] text-muted">
							<input
								aria-label="From"
								type="date"
								value={custom.from}
								onChange={(e) =>
									e.target.value &&
									setCustom({ ...custom, from: e.target.value })
								}
								className={`${inputCls.replace("w-full", "w-auto")} h-8 font-mono`}
							/>
							to
							<input
								aria-label="To"
								type="date"
								value={custom.to}
								onChange={(e) =>
									e.target.value && setCustom({ ...custom, to: e.target.value })
								}
								className={`${inputCls.replace("w-full", "w-auto")} h-8 font-mono`}
							/>
						</span>
					) : (
						<span className="font-mono text-[12px] text-muted">
							{range.from} → {range.to}
						</span>
					)}
				</div>

				<div className="max-h-[42vh] overflow-y-auto rounded-[12px] border border-line">
					<table className="w-full text-[12.5px]">
						<thead className="sticky top-0 bg-surface text-left text-[11px] uppercase tracking-[0.06em] text-muted">
							<tr>
								<th className="px-3 py-2 font-semibold">Date</th>
								{!project && (
									<th className="px-3 py-2 font-semibold">Project</th>
								)}
								<th className="px-3 py-2 font-semibold">Task</th>
								<th className="px-3 py-2 text-right font-semibold">Hours</th>
								<th className="px-3 py-2 text-right font-semibold">Amount</th>
							</tr>
						</thead>
						<tbody>
							{sheet?.rows.map((r) => (
								<tr
									key={`${r.date}-${r.projectId}-${r.task}`}
									className="border-t border-line"
								>
									<td className="px-3 py-1.5 font-mono text-[11.5px] text-muted">
										{r.date}
									</td>
									{!project && <td className="px-3 py-1.5">{r.project}</td>}
									<td className="px-3 py-1.5">{r.task}</td>
									<td className="px-3 py-1.5 text-right font-mono tabular">
										{(r.minutes / 60).toFixed(2)}
									</td>
									<td className="px-3 py-1.5 text-right font-mono tabular">
										{currency(r.amount)}
									</td>
								</tr>
							))}
							{sheet && sheet.rows.length === 0 && (
								<tr>
									<td colSpan={5} className="px-3 py-6 text-center text-muted">
										No tracked time in this range.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>

				<div className="flex items-center justify-between">
					<div className="text-[13px]">
						{loading ? (
							<span className="flex items-center gap-2 text-muted">
								<Loader2 size={14} className="animate-spin" /> Loading…
							</span>
						) : sheet ? (
							<span>
								<b className="font-mono">{formatMinutes(sheet.totalMinutes)}</b>
								<span className="text-muted">
									{" "}
									({(sheet.totalMinutes / 60).toFixed(2)} h)
								</span>
								{sheet.totalAmount !== null && (
									<>
										{" · "}
										<b className="font-mono">{currency(sheet.totalAmount)}</b>
									</>
								)}
							</span>
						) : null}
					</div>
					<div className="flex items-center gap-2">
						{!inTauri && (
							<input
								aria-label="Save to folder"
								value={savePath}
								onChange={(e) => setSavePath(e.target.value)}
								placeholder="Save to folder"
								className={`${inputCls.replace("w-full", "w-56")} h-8 font-mono text-[11px]`}
							/>
						)}
						<Button
							disabled={!sheet?.rows.length}
							onClick={() => exportAs("csv")}
						>
							<FileDown size={14} /> CSV
						</Button>
						<Button
							tone="primary"
							disabled={!sheet?.rows.length}
							onClick={() => exportAs("pdf")}
						>
							<FileDown size={14} /> PDF
						</Button>
					</div>
				</div>
			</div>
		</Modal>
	);
}
