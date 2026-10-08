import { dlopen, FFIType, ptr } from "bun:ffi";

let lib: {
	getLastInput: (p: ReturnType<typeof ptr>) => boolean;
	tick: () => number;
} | null = null;

try {
	const user32 = dlopen("user32.dll", {
		GetLastInputInfo: { args: [FFIType.ptr], returns: FFIType.bool },
	});
	const kernel32 = dlopen("kernel32.dll", {
		GetTickCount: { args: [], returns: FFIType.u32 },
	});
	lib = {
		getLastInput: (p) => user32.symbols.GetLastInputInfo(p),
		tick: () => kernel32.symbols.GetTickCount(),
	};
} catch (err) {
	console.warn("[idle] system idle detection unavailable:", err);
}

const info = new Uint32Array(2);

/** Seconds since the last keyboard or mouse input anywhere on the system. */
export function systemIdleSec(): number {
	if (!lib) return 0;
	info[0] = 8; // sizeof(LASTINPUTINFO)
	if (!lib.getLastInput(ptr(info))) return 0;
	const ms = (lib.tick() - info[1]!) >>> 0;
	return Math.floor(ms / 1000);
}
