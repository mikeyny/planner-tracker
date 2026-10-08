import { formatMinutes } from "@deep/shared";
import { AlertTriangle, Check } from "lucide-react";
import { useCapacity } from "../lib/queries";

/** "Planned 7h10 · free 5h · you usually take 1.4× → about 10h" */
export function CapacityBanner({ date }: { date: string }) {
	const { data: c } = useCapacity(date);
	if (!c || c.plannedMin === 0) return null;
	const mult = c.multiplier && c.multiplier !== 1 ? c.multiplier : null;
	if (!c.overloaded) {
		return (
			<div className="flex items-center gap-2.5 rounded-[11px] border border-line bg-surface px-3.5 py-2.5 text-[12.5px] text-muted">
				<Check size={15} className="text-good" />
				<span>
					Planned{" "}
					<b className="font-mono text-fg">{formatMinutes(c.plannedMin)}</b>
					{mult && (
						<>
							{" "}
							(about{" "}
							<b className="font-mono text-fg">
								{formatMinutes(c.adjustedMin)}
							</b>{" "}
							at your usual {mult}×)
						</>
					)}{" "}
					with{" "}
					<b className="font-mono text-fg">{formatMinutes(c.availableMin)}</b>{" "}
					free. It fits.
				</span>
			</div>
		);
	}
	return (
		<div className="flex items-start gap-2.5 rounded-[11px] border border-[#4a3c15] bg-warn-bg px-3.5 py-2.5 text-[12.5px] text-[#f7dc9a]">
			<AlertTriangle size={15} className="mt-0.5 shrink-0" />
			<span>
				Planned{" "}
				<b className="font-mono text-[#fff2cc]">
					{formatMinutes(c.plannedMin)}
				</b>{" "}
				of work with{" "}
				<b className="font-mono text-[#fff2cc]">
					{formatMinutes(c.availableMin)}
				</b>{" "}
				free
				{mult ? (
					<>
						. You usually take{" "}
						<b className="font-mono text-[#fff2cc]">{mult}×</b> your estimates,
						so this is really about{" "}
						<b className="font-mono text-[#fff2cc]">
							{formatMinutes(c.adjustedMin)}
						</b>
					</>
				) : null}
				. Move something to tomorrow?
			</span>
		</div>
	);
}
