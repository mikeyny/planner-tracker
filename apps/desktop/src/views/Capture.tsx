import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx, Kbd } from "../components/ui";
import { api } from "../lib/api";
import { useLiveState } from "../lib/live";
import { capture } from "../lib/queries";
import { desktop, onTauriEvent } from "../lib/tauri";

type Kind = "parking" | "urge" | "task";

/** Ctrl+Shift+Space from anywhere: get the thought out of your head and go back to work. */
export function CaptureBar() {
	const [text, setText] = useState("");
	const [kind, setKind] = useState<Kind>("parking");
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const ref = useRef<HTMLInputElement>(null);
	const live = useLiveState();

	useEffect(() => {
		const reset = () => {
			setText("");
			setKind("parking");
			setSaved(false);
			setError(null);
			setTimeout(() => ref.current?.focus(), 30);
		};
		reset();
		const un = onTauriEvent("capture-shown", reset);
		const onBlur = () => desktop.hideSelf();
		window.addEventListener("blur", onBlur);
		return () => {
			un.then((f) => f());
			window.removeEventListener("blur", onBlur);
		};
	}, []);

	const save = async () => {
		const t = text.trim();
		if (!t && kind !== "urge") return;
		try {
			if (kind === "task")
				await api.post("/tasks", { title: t, plannedFor: null });
			else await capture(t, kind);
			setSaved(true);
			setTimeout(() => desktop.hideSelf(), 450);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Couldn't save");
		}
	};

	const options: { k: Kind; label: string }[] = [
		{ k: "parking", label: "Thought" },
		{ k: "task", label: "Inbox task" },
		{ k: "urge", label: "Urge" },
	];

	return (
		<div className="flex h-full flex-col justify-center gap-2.5 border border-line-strong bg-surface px-4">
			<div className="flex items-center gap-3">
				{saved ? (
					<Check size={18} className="text-good" />
				) : (
					<span className="size-2.5 shrink-0 rounded-full bg-rose" />
				)}
				<input
					ref={ref}
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") save();
						if (e.key === "Escape") desktop.hideSelf();
						if (e.key === "Tab") {
							e.preventDefault();
							const i = options.findIndex((o) => o.k === kind);
							setKind(options[(i + 1) % options.length]!.k);
						}
					}}
					placeholder={saved ? "Saved" : "What's on your mind?"}
					className="h-10 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
				/>
			</div>
			<div className="flex items-center gap-2 text-[11.5px] text-muted">
				{options.map((o) => (
					<button
						key={o.k}
						type="button"
						onClick={() => setKind(o.k)}
						className={cx(
							"rounded-full px-2 py-0.5 font-semibold cursor-pointer",
							kind === o.k ? "bg-fg text-bg" : "hover:text-fg",
						)}
					>
						{o.label}
					</button>
				))}
				<span className="ml-1 flex items-center gap-1">
					<Kbd>Tab</Kbd> switch
				</span>
				<span className="ml-auto truncate">
					{error ??
						(live?.session?.kind === "focus"
							? `Goes to this session's parking lot (${live.session.project?.name ?? "focus"})`
							: "Enter to save · Esc to close")}
				</span>
			</div>
		</div>
	);
}
