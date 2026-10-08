import { Composition } from "remotion";
import { FPS, HEIGHT, WIDTH } from "./theme";
import { TOTAL_FRAMES, Walkthrough } from "./Walkthrough";

export function Root() {
	return (
		<Composition
			id="DeepWalkthrough"
			component={Walkthrough}
			durationInFrames={TOTAL_FRAMES}
			fps={FPS}
			width={WIDTH}
			height={HEIGHT}
		/>
	);
}
