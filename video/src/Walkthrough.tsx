import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Fragment } from "react";
import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { Captions } from "./components";
import { loadFonts } from "./fonts";
import { SCENES } from "./scenes";
import { SCRIPT } from "./script";
import { C, FADE, FPS } from "./theme";
import voiceover from "./voiceover.json";

loadFonts();

/** Narration starts this long after a scene begins, and the scene holds this long after it ends. */
const LEAD = 0.5;
const TAIL = 1.0;
/** Scenes that need more screen time than their narration (to read the screen). */
const MIN_SECONDS: Partial<Record<string, number>> = {
	keys: 10,
	outro: 7,
	intro: 7,
};

export const TIMELINE = SCRIPT.map((s) => {
	const vo = voiceover.find((v) => v.id === s.id);
	const seconds = vo?.seconds ?? 4;
	return {
		...s,
		file: vo?.file ?? null,
		seconds,
		frames: Math.ceil(
			Math.max(LEAD + seconds + TAIL, MIN_SECONDS[s.id] ?? 0) * FPS,
		),
	};
});

export const TOTAL_FRAMES =
	TIMELINE.reduce((a, s) => a + s.frames, 0) - FADE * (TIMELINE.length - 1);

export function Walkthrough() {
	return (
		<AbsoluteFill style={{ background: C.bg }}>
			<TransitionSeries>
				{TIMELINE.map((s, i) => (
					<Fragment key={s.id}>
						{i > 0 && (
							<TransitionSeries.Transition
								presentation={fade()}
								timing={linearTiming({ durationInFrames: FADE })}
							/>
						)}
						<TransitionSeries.Sequence durationInFrames={s.frames}>
							<AbsoluteFill>{SCENES[s.id].render()}</AbsoluteFill>
							<Sequence from={Math.round(LEAD * FPS)} layout="none">
								{s.file && <Audio src={staticFile(s.file)} />}
								<Captions text={s.text} seconds={s.seconds} />
							</Sequence>
						</TransitionSeries.Sequence>
					</Fragment>
				))}
			</TransitionSeries>
		</AbsoluteFill>
	);
}
