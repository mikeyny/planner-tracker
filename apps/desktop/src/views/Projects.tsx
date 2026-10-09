import { formatMinutes, type Project } from "@deep/shared";
import {
	Archive,
	FileText,
	FolderOpen,
	FolderSearch,
	Pencil,
	Play,
	Plus,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DiscoverDialog, TimesheetDialog } from "../components/ProjectTools";
import {
	Button,
	cx,
	EmptyState,
	IconButton,
	inputCls,
	Modal,
	ProjectDot,
} from "../components/ui";
import { api } from "../lib/api";
import { PROJECT_COLORS } from "../lib/hooks";
import { queryClient, useProjects, useTasks } from "../lib/queries";
import { pickFolder } from "../lib/tauri";
import { attempt, setUi, toast } from "../lib/ui";

export function ProjectsView() {
	const { data: projects = [] } = useProjects();
	const { data: open = [] } = useTasks("open");
	const [editing, setEditing] = useState<Project | "new" | null>(null);
	const [finding, setFinding] = useState(false);
	// undefined = closed, null = all billable projects
	const [sheetFor, setSheetFor] = useState<Project | null | undefined>(
		undefined,
	);
	const anyBillable = projects.some((p) => p.billable);

	return (
		<div className="mx-auto flex h-full min-h-0 max-w-[980px] flex-col gap-5 overflow-y-auto pb-10">
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em]">
						Projects
					</h1>
					<p className="mt-1 text-[13px] text-muted">
						Link each project to its repo folder so VS Code time is tracked to
						the right place.
					</p>
				</div>
				<div className="flex gap-2">
					{anyBillable && (
						<Button onClick={() => setSheetFor(null)}>
							<FileText size={15} /> Timesheets
						</Button>
					)}
					<Button onClick={() => setFinding(true)}>
						<FolderSearch size={15} /> Find projects
					</Button>
					<Button tone="primary" onClick={() => setEditing("new")}>
						<Plus size={15} /> New project
					</Button>
				</div>
			</header>

			{projects.length === 0 && (
				<EmptyState title="No projects yet">
					Create one for each thing you split your time between.
				</EmptyState>
			)}

			<div className="grid grid-cols-2 gap-3">
				{projects.map((p) => {
					const count = open.filter((t) => t.projectId === p.id).length;
					return (
						<div
							key={p.id}
							className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4"
						>
							<div className="flex items-center gap-2.5">
								<ProjectDot color={p.color} size={11} />
								<h2 className="font-display text-[17px] font-bold">{p.name}</h2>
								{p.billable && (
									<span className="rounded-[5px] border border-line px-1.5 text-[10.5px] text-muted">
										billable{p.hourlyRate ? ` · $${p.hourlyRate}/h` : ""}
									</span>
								)}
								<div className="ml-auto flex">
									<IconButton
										label="Start focus"
										onClick={() => setUi({ startDialog: { projectId: p.id } })}
									>
										<Play size={14} className="fill-current" />
									</IconButton>
									{p.billable && (
										<IconButton
											label="Timesheet"
											onClick={() => setSheetFor(p)}
										>
											<FileText size={14} />
										</IconButton>
									)}
									<IconButton label="Edit" onClick={() => setEditing(p)}>
										<Pencil size={14} />
									</IconButton>
								</div>
							</div>
							<div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
								<span>{count} open tasks</span>
								{p.client && <span>Client: {p.client}</span>}
								{p.weeklyTargetMin ? (
									<span>Target {formatMinutes(p.weeklyTargetMin)}/week</span>
								) : null}
							</div>
							{p.paths.length > 0 ? (
								<div className="flex flex-col gap-1">
									{p.paths.map((path) => (
										<span
											key={path}
											className="flex items-center gap-1.5 truncate font-mono text-[10.5px] text-muted"
										>
											<FolderOpen size={12} className="shrink-0" /> {path}
										</span>
									))}
								</div>
							) : (
								<span className="text-[11.5px] text-faint">
									No folder linked: VS Code can't track this one yet.
								</span>
							)}
							{p.leftOffNote && (
								<div className="rounded-[10px] bg-bg px-3 py-2 text-[12px] text-muted">
									<span className="font-semibold text-fg">Left off: </span>
									{p.leftOffNote}
								</div>
							)}
						</div>
					);
				})}
			</div>

			<ProjectDialog
				project={editing === "new" ? null : editing}
				open={editing !== null}
				onClose={() => setEditing(null)}
				usedColors={projects.map((p) => p.color)}
			/>
			<DiscoverDialog open={finding} onClose={() => setFinding(false)} />
			<TimesheetDialog
				open={sheetFor !== undefined}
				project={sheetFor ?? null}
				onClose={() => setSheetFor(undefined)}
			/>
		</div>
	);
}

function ProjectDialog({
	project,
	open,
	onClose,
	usedColors,
}: {
	project: Project | null;
	open: boolean;
	onClose: () => void;
	usedColors: string[];
}) {
	const [name, setName] = useState("");
	const [color, setColor] = useState(PROJECT_COLORS[0]!);
	const [paths, setPaths] = useState<string[]>([]);
	const [pathInput, setPathInput] = useState("");
	const [client, setClient] = useState("");
	const [billable, setBillable] = useState(false);
	const [rate, setRate] = useState("");
	const [target, setTarget] = useState("");

	// Fill the form once when the dialog opens (or switches project). Reading the
	// latest props through a ref keeps parent re-renders and refetches, which create
	// new `project`/`usedColors` objects, from wiping what you're typing.
	const latest = useRef({ project, usedColors });
	latest.current = { project, usedColors };
	const projectId = project?.id ?? null;

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run only when the dialog opens or targets another project
	useEffect(() => {
		if (!open) return;
		const { project, usedColors } = latest.current;
		setName(project?.name ?? "");
		setColor(
			project?.color ??
				PROJECT_COLORS.find((c) => !usedColors.includes(c)) ??
				PROJECT_COLORS[0]!,
		);
		setPaths(project?.paths ?? []);
		setPathInput("");
		setClient(project?.client ?? "");
		setBillable(project?.billable ?? false);
		setRate(project?.hourlyRate ? String(project.hourlyRate) : "");
		setTarget(
			project?.weeklyTargetMin ? String(project.weeklyTargetMin / 60) : "",
		);
	}, [open, projectId]);

	const addPath = (p: string) => {
		const v = p.trim();
		if (v && !paths.includes(v)) setPaths([...paths, v]);
		setPathInput("");
	};

	const save = async () => {
		const allPaths = pathInput.trim() ? [...paths, pathInput.trim()] : paths;
		const body = {
			name: name.trim(),
			color,
			paths: allPaths,
			client: client.trim() || null,
			billable,
			hourlyRate: rate ? Number(rate) : null,
			weeklyTargetMin: target ? Math.round(Number(target) * 60) : null,
		};
		const ok = await attempt(() =>
			project
				? api.patch(`/projects/${project.id}`, body)
				: api.post("/projects", body),
		);
		if (ok) {
			queryClient.invalidateQueries({ queryKey: ["projects"] });
			toast(project ? "Project saved" : "Project created");
			onClose();
		}
	};

	const archive = async () => {
		if (!project) return;
		await attempt(() => api.del(`/projects/${project.id}`));
		queryClient.invalidateQueries({ queryKey: ["projects"] });
		onClose();
	};

	return (
		<Modal
			open={open}
			onClose={onClose}
			title={project ? "Edit project" : "New project"}
			width={540}
		>
			<form
				className="flex flex-col gap-4"
				onSubmit={(e) => {
					e.preventDefault();
					save();
				}}
			>
				<label className="flex flex-col gap-1.5 text-[12px] font-semibold text-muted">
					Name
					<input
						autoFocus
						className={inputCls}
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="SMP"
					/>
				</label>
				<div className="flex flex-col gap-1.5">
					<span className="text-[12px] font-semibold text-muted">Colour</span>
					<div className="flex gap-2">
						{PROJECT_COLORS.map((c) => (
							<button
								key={c}
								type="button"
								aria-label={`Colour ${c}`}
								onClick={() => setColor(c)}
								className={cx(
									"size-7 rounded-full cursor-pointer",
									color === c &&
										"ring-2 ring-fg ring-offset-2 ring-offset-surface",
								)}
								style={{ background: c }}
							/>
						))}
					</div>
				</div>
				<div className="flex flex-col gap-1.5">
					<span className="text-[12px] font-semibold text-muted">
						Repo folders
					</span>
					{paths.map((p) => (
						<div
							key={p}
							className="flex items-center gap-2 rounded-[9px] bg-bg px-2.5 py-1.5 font-mono text-[11px]"
						>
							<FolderOpen size={13} className="text-muted" />
							<span className="min-w-0 flex-1 truncate">{p}</span>
							<button
								type="button"
								aria-label="Remove folder"
								onClick={() => setPaths(paths.filter((x) => x !== p))}
								className="text-muted hover:text-fg cursor-pointer"
							>
								<X size={13} />
							</button>
						</div>
					))}
					<div className="flex gap-2">
						<input
							className={`${inputCls} font-mono text-[12px]`}
							value={pathInput}
							onChange={(e) => setPathInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									addPath(pathInput);
								}
							}}
							placeholder="C:\Users\nyama\Documents\dev\techvest\smp"
						/>
						<Button
							onClick={async () => {
								const p = await pickFolder();
								if (p) addPath(p);
							}}
						>
							<FolderOpen size={14} /> Browse
						</Button>
					</div>
				</div>
				<div className="grid grid-cols-3 gap-3">
					<label className="flex flex-col gap-1.5 text-[12px] font-semibold text-muted">
						Client
						<input
							className={inputCls}
							value={client}
							onChange={(e) => setClient(e.target.value)}
							placeholder="optional"
						/>
					</label>
					<label className="flex flex-col gap-1.5 text-[12px] font-semibold text-muted">
						Rate per hour
						<input
							className={inputCls}
							type="number"
							min={0}
							value={rate}
							onChange={(e) => setRate(e.target.value)}
							disabled={!billable}
						/>
					</label>
					<label className="flex flex-col gap-1.5 text-[12px] font-semibold text-muted">
						Hours per week
						<input
							className={inputCls}
							type="number"
							min={0}
							step={0.5}
							value={target}
							onChange={(e) => setTarget(e.target.value)}
							placeholder="target"
						/>
					</label>
				</div>
				<label className="flex items-center gap-2 text-[13px]">
					<input
						type="checkbox"
						checked={billable}
						onChange={(e) => setBillable(e.target.checked)}
						className="size-4 accent-[#eceaf0]"
					/>
					Billable client work
				</label>
				<div className="flex items-center justify-between">
					{project ? (
						<Button tone="danger" onClick={archive}>
							<Archive size={14} /> Archive
						</Button>
					) : (
						<span />
					)}
					<div className="flex gap-2">
						<Button tone="quiet" onClick={onClose}>
							Cancel
						</Button>
						<Button tone="primary" type="submit" disabled={!name.trim()}>
							Save
						</Button>
					</div>
				</div>
			</form>
		</Modal>
	);
}
