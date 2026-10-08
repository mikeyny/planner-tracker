/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly DEEP_TOKEN?: string;
	readonly API_PORT?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
