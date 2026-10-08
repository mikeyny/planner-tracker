import { continueRender, delayRender, staticFile } from "remotion";

const FACES = [
	{ family: "Onest", file: "fonts/onest-latin-wght-normal.woff2" },
	{
		family: "Schibsted Grotesk",
		file: "fonts/schibsted-grotesk-latin-wght-normal.woff2",
	},
	{
		family: "Martian Mono",
		file: "fonts/martian-mono-latin-wght-normal.woff2",
	},
];

let loaded = false;

/** Load the app's variable fonts before the first frame renders. */
export function loadFonts() {
	if (loaded || typeof document === "undefined") return;
	loaded = true;
	const handle = delayRender("Loading fonts");
	Promise.all(
		FACES.map(async ({ family, file }) => {
			const face = new FontFace(
				family,
				`url(${staticFile(file)}) format("woff2")`,
				{
					weight: "100 900",
				},
			);
			await face.load();
			document.fonts.add(face);
		}),
	)
		.then(() => continueRender(handle))
		.catch((err) => {
			console.error("font load failed", err);
			continueRender(handle);
		});
}
