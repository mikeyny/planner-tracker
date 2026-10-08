import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { startLive } from "./lib/live";
import { queryClient, wireInvalidation } from "./lib/queries";
import { windowLabel } from "./lib/tauri";
import { CaptureBar } from "./views/Capture";
import { MiniTimer } from "./views/Mini";

// One frontend serves three windows; the Tauri window label picks the view.
const label = windowLabel();

startLive();
wireInvalidation();

// Block the webview's own context menu and reload shortcuts outside dev.
if (!import.meta.env.DEV) {
	window.addEventListener("contextmenu", (e) => e.preventDefault());
}

const root = createRoot(document.getElementById("root")!);
root.render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			{label === "mini" ? (
				<MiniTimer />
			) : label === "capture" ? (
				<CaptureBar />
			) : (
				<App />
			)}
		</QueryClientProvider>
	</StrictMode>,
);
