import { CheckCircle2, CircleAlert } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

/* Building blocks for the Settings screen. */

export function TextInput({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
}) {
	const [v, setV] = useState(value);
	useEffect(() => setV(value), [value]);
	return (
		<input
			value={v}
			placeholder={placeholder}
			onChange={(e) => setV(e.target.value)}
			onBlur={() => v !== value && onChange(v.trim())}
			onKeyDown={(e) =>
				e.key === "Enter" && (e.target as HTMLInputElement).blur()
			}
			className="h-8 w-72 rounded-lg border border-line bg-bg px-2 font-mono text-[12px] text-fg placeholder:text-faint"
		/>
	);
}

export function Group({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col rounded-[14px] border border-line bg-surface">
			<h2 className="border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
				{title}
			</h2>
			<div className="flex flex-col divide-y divide-line">{children}</div>
		</section>
	);
}

export function Row({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-4 px-4 py-3">
			<div>
				<div className="text-[13.5px]">{label}</div>
				{hint && <div className="text-[11.5px] text-muted">{hint}</div>}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}

export function Toggle({
	value,
	onChange,
}: {
	value: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={value}
			onClick={() => onChange(!value)}
			className={`relative h-6 w-10 rounded-full transition-colors cursor-pointer ${value ? "bg-fg" : "bg-line-strong"}`}
		>
			<span
				className={`absolute top-1 size-4 rounded-full transition-all ${value ? "left-5 bg-bg" : "left-1 bg-muted"}`}
			/>
		</button>
	);
}

export function NumberInput({
	value,
	onChange,
	suffix,
	step = 1,
	min = 0,
}: {
	value: number;
	onChange: (v: number) => void;
	suffix?: string;
	step?: number;
	min?: number;
}) {
	const [v, setV] = useState(String(value));
	useEffect(() => setV(String(value)), [value]);
	return (
		<span className="flex items-center gap-2 text-[12px] text-muted">
			<input
				type="number"
				value={v}
				step={step}
				min={min}
				onChange={(e) => setV(e.target.value)}
				onBlur={() => {
					const n = Number(v);
					if (Number.isFinite(n) && n >= min && n !== value) onChange(n);
					else setV(String(value));
				}}
				className="h-8 w-20 rounded-lg border border-line bg-bg px-2 text-right font-mono text-[13px] text-fg"
			/>
			{suffix}
		</span>
	);
}

export function TimeInput({
	value,
	onChange,
}: {
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<input
			type="time"
			value={value}
			onChange={(e) => e.target.value && onChange(e.target.value)}
			className="h-8 rounded-lg border border-line bg-bg px-2 font-mono text-[13px]"
		/>
	);
}

export function Status({ ok, text }: { ok: boolean; text: string }) {
	return (
		<span
			className={`flex items-center gap-1.5 text-[12.5px] ${ok ? "text-good" : "text-warn"}`}
		>
			{ok ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
			{text}
		</span>
	);
}
