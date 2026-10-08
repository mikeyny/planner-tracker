import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	clearScreen: false,
	// Read the repo-root .env so the app knows the API port and token.
	envDir: resolve(__dirname, "../.."),
	envPrefix: ["VITE_", "DEEP_TOKEN", "API_PORT"],
	server: {
		port: 5180,
		strictPort: true,
		watch: { ignored: ["**/src-tauri/**"] },
	},
	build: {
		target: "es2022",
		outDir: "dist",
		emptyOutDir: true,
	},
});
