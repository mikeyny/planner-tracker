import type { Task } from "@deep/shared";
import { Loader2, Scissors, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { queryClient } from "../lib/queries";
import { attempt, toast } from "../lib/ui";
import { Button, inputCls, Modal } from "./ui";

interface Step {
	uid: number;
	title: string;
	estimateMin: number;
}

let nextUid = 1;
const blankStep = (): Step => ({ uid: nextUid++, title: "", estimateMin: 25 });

/** "Make it smaller": AI proposes ≤25-minute steps; nothing changes until you accept. */
export function SplitDialog({
	task,
	onClose,
}: {
	task: Task | null;
	onClose: () => void;
}) {
	const [steps, setSteps] = useState<Step[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!task) return;
		setSteps(null);
		setError(null);
		api
			.post<Omit<Step, "uid">[]>(`/tasks/${task.id}/breakdown`)
			.then((res) => setSteps(res.map((s) => ({ ...s, uid: nextUid++ }))))
			.catch((e: Error) => {
				setError(e.message);
				setSteps([blankStep()]);
			});
	}, [task]);

	const accept = async () => {
		if (!task || !steps) return;
		const clean = steps
			.filter((s) => s.title.trim())
			.map(({ title, estimateMin }) => ({ title, estimateMin }));
		if (clean.length === 0) return;
		const ok = await attempt(() =>
			api.post(`/tasks/${task.id}/split`, { steps: clean }),
		);
		if (ok) {
			queryClient.invalidateQueries({ queryKey: ["tasks"] });
			toast(`Split into ${clean.length} steps`);
			onClose();
		}
	};

	return (
		<Modal
			open={!!task}
			onClose={onClose}
			width={560}
			title={
				<span className="flex items-center gap-2">
					<Scissors size={16} /> Make it smaller
				</span>
			}
		>
			<div className="flex flex-col gap-4">
				<div className="rounded-xl border border-[#5c3346] bg-[#2c1f26] px-3.5 py-3 text-[13.5px] font-semibold">
					{task?.title}
				</div>
				{error && (
					<div className="text-[12.5px] text-warn">
						{error} You can still write the steps yourself.
					</div>
				)}
				{!steps ? (
					<div className="flex items-center gap-2 py-6 text-muted">
						<Loader2 size={16} className="animate-spin" /> Breaking it down…
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{steps.map((s, i) => (
							<div key={s.uid} className="flex items-center gap-2">
								<span className="w-5 font-mono text-[11px] text-muted">
									{i + 1}
								</span>
								<input
									className={inputCls}
									value={s.title}
									placeholder="Step"
									onChange={(e) =>
										setSteps(
											steps.map((x, j) =>
												j === i ? { ...x, title: e.target.value } : x,
											),
										)
									}
								/>
								<input
									className={`${inputCls} w-20 text-right font-mono`}
									type="number"
									min={5}
									max={50}
									value={s.estimateMin}
									onChange={(e) =>
										setSteps(
											steps.map((x, j) =>
												j === i
													? { ...x, estimateMin: Number(e.target.value) || 25 }
													: x,
											),
										)
									}
								/>
								<button
									type="button"
									aria-label="Remove step"
									className="text-muted hover:text-fg cursor-pointer"
									onClick={() => setSteps(steps.filter((_, j) => j !== i))}
								>
									<X size={15} />
								</button>
							</div>
						))}
						<button
							type="button"
							onClick={() => setSteps([...steps, blankStep()])}
							className="self-start text-[12.5px] text-muted hover:text-fg cursor-pointer"
						>
							+ Add a step
						</button>
					</div>
				)}
				<div className="flex justify-end gap-2">
					<Button tone="quiet" onClick={onClose}>
						Cancel
					</Button>
					<Button
						tone="primary"
						disabled={!steps?.some((s) => s.title.trim())}
						onClick={accept}
					>
						Replace with {steps?.filter((s) => s.title.trim()).length ?? 0}{" "}
						steps
					</Button>
				</div>
			</div>
		</Modal>
	);
}
