import type { Project } from "@deep/shared";
import { X } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode, useEffect } from "react";
import { NO_PROJECT_COLOR } from "../lib/hooks";

export function cx(...parts: (string | false | null | undefined)[]) {
	return parts.filter(Boolean).join(" ");
}

type Tone = "primary" | "ghost" | "quiet" | "danger" | "rose";

export function Button({
	tone = "ghost",
	size = "md",
	className,
	children,
	...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
	tone?: Tone;
	size?: "sm" | "md" | "lg";
}) {
	return (
		<button
			type="button"
			className={cx(
				"inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer whitespace-nowrap",
				size === "sm" && "h-7 px-2.5 text-xs",
				size === "md" && "h-9 px-3.5 text-[13px]",
				size === "lg" && "h-11 px-5 text-sm",
				tone === "primary" && "bg-fg text-bg hover:bg-white",
				tone === "ghost" &&
					"border border-line bg-raised text-fg hover:bg-hover hover:border-line-strong",
				tone === "quiet" && "text-muted hover:text-fg hover:bg-raised",
				tone === "danger" &&
					"border border-line text-[#f08a8a] hover:bg-[#2a1517]",
				tone === "rose" && "bg-rose text-white hover:brightness-110",
				className,
			)}
			{...rest}
		>
			{children}
		</button>
	);
}

export function IconButton({
	label,
	className,
	children,
	...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className={cx(
				"inline-grid size-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg transition-colors cursor-pointer",
				className,
			)}
			{...rest}
		>
			{children}
		</button>
	);
}

export function Kbd({ children }: { children: ReactNode }) {
	return (
		<kbd className="whitespace-nowrap rounded-[5px] border border-line border-b-2 px-1.5 py-px font-mono text-[10px] text-muted">
			{children}
		</kbd>
	);
}

export function ProjectDot({
	color,
	size = 8,
}: {
	color?: string | null;
	size?: number;
}) {
	return (
		<span
			className="inline-block shrink-0 rounded-full"
			style={{
				width: size,
				height: size,
				background: color ?? NO_PROJECT_COLOR,
			}}
		/>
	);
}

export function ProjectChip({
	project,
	className,
}: {
	project?: Pick<Project, "name" | "color"> | null;
	className?: string;
}) {
	if (!project) return null;
	return (
		<span
			className={cx(
				"inline-flex items-center gap-1.5 rounded-full bg-raised px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap",
				className,
			)}
		>
			<ProjectDot color={project.color} />
			{project.name}
		</span>
	);
}

export function SectionLabel({
	children,
	right,
}: {
	children: ReactNode;
	right?: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
			<span>{children}</span>
			{right}
		</div>
	);
}

export function Modal({
	open,
	onClose,
	title,
	children,
	width = 520,
}: {
	open: boolean;
	onClose: () => void;
	title?: ReactNode;
	children: ReactNode;
	width?: number;
}) {
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				onClose();
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [open, onClose]);
	if (!open) return null;
	return (
		<div
			className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-6 backdrop-blur-[2px]"
			onMouseDown={(e) => e.target === e.currentTarget && onClose()}
		>
			<div
				className="animate-pop max-h-[calc(100vh-48px)] w-full overflow-auto rounded-2xl border border-line bg-surface shadow-2xl"
				style={{ maxWidth: width }}
			>
				{title && (
					<div className="flex items-center justify-between border-b border-line px-5 py-3.5">
						<h2 className="font-display text-[17px] font-bold tracking-tight">
							{title}
						</h2>
						<IconButton label="Close" onClick={onClose}>
							<X size={16} />
						</IconButton>
					</div>
				)}
				<div className="p-5">{children}</div>
			</div>
		</div>
	);
}

export const inputCls =
	"h-9 w-full rounded-[10px] border border-line bg-bg px-3 text-[13px] text-fg placeholder:text-faint outline-none focus:border-line-strong";

export function Segmented<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T;
	options: { value: T; label: ReactNode; title?: string }[];
	onChange: (v: T) => void;
}) {
	return (
		<div className="inline-flex flex-wrap gap-1 rounded-[11px] border border-line bg-bg p-1">
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					title={o.title}
					onClick={() => onChange(o.value)}
					className={cx(
						"rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer",
						o.value === value ? "bg-fg text-bg" : "text-muted hover:text-fg",
					)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

export function EmptyState({
	title,
	children,
}: {
	title: string;
	children?: ReactNode;
}) {
	return (
		<div className="rounded-xl border border-dashed border-line px-5 py-8 text-center">
			<div className="font-display text-[15px] font-bold">{title}</div>
			{children && (
				<div className="mt-1 text-[13px] text-muted">{children}</div>
			)}
		</div>
	);
}
