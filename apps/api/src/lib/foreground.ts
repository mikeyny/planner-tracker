import { dlopen, FFIType, JSCallback, type Pointer, ptr } from "bun:ffi";

/** The window the user is currently looking at. */
export interface ForegroundWindow {
	/** Lower-case image file name, e.g. "chrome.exe" ("unknown" if the process can't be opened). */
	exe: string;
	/** Full image path, or null when the process couldn't be queried. */
	path: string | null;
	/** Window title (may be empty). */
	title: string;
	pid: number;
}

/** HWND as bun:ffi hands it back (a number on x64, bigint for very high addresses). */
type Hwnd = Pointer | bigint;

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const TITLE_CAP = 1024; // chars; grown on demand for very long titles
const PATH_CAP = 1024; // chars; long-path image names beyond this are truncated → treated as failure
const CLASS_CAP = 64;
/** Shell windows that mean "no app in front" (desktop, taskbar). */
const SHELL_CLASSES = new Set([
	"Progman",
	"WorkerW",
	"Shell_TrayWnd",
	"Shell_SecondaryTrayWnd",
]);

function load() {
	if (process.platform !== "win32") return null;
	const user32 = dlopen("user32.dll", {
		GetForegroundWindow: { args: [], returns: FFIType.ptr },
		GetWindowTextLengthW: { args: [FFIType.ptr], returns: FFIType.i32 },
		GetWindowTextW: {
			args: [FFIType.ptr, FFIType.ptr, FFIType.i32],
			returns: FFIType.i32,
		},
		GetClassNameW: {
			args: [FFIType.ptr, FFIType.ptr, FFIType.i32],
			returns: FFIType.i32,
		},
		GetWindowThreadProcessId: {
			args: [FFIType.ptr, FFIType.ptr],
			returns: FFIType.u32,
		},
		EnumChildWindows: {
			// HWND parent, WNDENUMPROC, LPARAM (pointer-sized)
			args: [FFIType.ptr, FFIType.function, FFIType.ptr],
			returns: FFIType.i32,
		},
	});
	const kernel32 = dlopen("kernel32.dll", {
		OpenProcess: {
			args: [FFIType.u32, FFIType.i32, FFIType.u32],
			returns: FFIType.ptr,
		},
		QueryFullProcessImageNameW: {
			args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr],
			returns: FFIType.i32,
		},
		CloseHandle: { args: [FFIType.ptr], returns: FFIType.i32 },
	});
	return { u: user32.symbols, k: kernel32.symbols };
}

let lib: ReturnType<typeof load> = null;
try {
	lib = load();
} catch (err) {
	console.warn("[foreground] window tracking unavailable:", err);
	lib = null;
}

export const foregroundAvailable: boolean = lib !== null;

// Reused buffers — nothing is allocated per sample except the result strings.
let titleBuf = new Uint16Array(TITLE_CAP);
const classBuf = new Uint16Array(CLASS_CAP);
const pathBuf = new Uint16Array(PATH_CAP);
const sizeBuf = new Uint32Array(1);
const pidBuf = new Uint32Array(1);
const childPidBuf = new Uint32Array(1);
const utf16 = new TextDecoder("utf-16le");

const decode = (buf: Uint16Array, len: number) =>
	len > 0 ? utf16.decode(buf.subarray(0, len)) : "";

function windowTitle(hwnd: Hwnd): string {
	const u = lib!.u;
	// GetWindowTextW reads the stored caption for other processes' windows without
	// sending a message, so it can't hang on an unresponsive app. Only when the title
	// fills the buffer do we ask for the real length (which does send WM_GETTEXTLENGTH).
	let n = u.GetWindowTextW(hwnd, ptr(titleBuf), titleBuf.length);
	if (n >= titleBuf.length - 1) {
		const want = u.GetWindowTextLengthW(hwnd);
		if (want >= titleBuf.length && want < 32768) {
			titleBuf = new Uint16Array(want + 1);
			n = u.GetWindowTextW(hwnd, ptr(titleBuf), titleBuf.length);
		}
	}
	return decode(titleBuf, n);
}

function windowClass(hwnd: Hwnd): string {
	const n = lib!.u.GetClassNameW(hwnd, ptr(classBuf), classBuf.length);
	return decode(classBuf, n);
}

function imagePath(pid: number): string | null {
	const k = lib!.k;
	const h = k.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
	if (!h) return null;
	try {
		sizeBuf[0] = pathBuf.length;
		if (!k.QueryFullProcessImageNameW(h, 0, ptr(pathBuf), ptr(sizeBuf))) {
			return null;
		}
		return decode(pathBuf, sizeBuf[0]!);
	} finally {
		k.CloseHandle(h);
	}
}

// UWP apps: the foreground window belongs to ApplicationFrameHost.exe and the real
// app's CoreWindow is a child owned by a different process. One long-lived callback.
let enumHostPid = 0;
let enumFoundPid = 0;
let enumCb: JSCallback | null = null;
function uwpChildPid(hwnd: Hwnd, hostPid: number): number {
	if (!enumCb) {
		enumCb = new JSCallback(
			(child: Pointer) => {
				if (!child) return 1;
				lib!.u.GetWindowThreadProcessId(child, ptr(childPidBuf));
				const p = childPidBuf[0]!;
				if (p && p !== enumHostPid) {
					enumFoundPid = p;
					return 0; // stop enumerating
				}
				return 1;
			},
			{ args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
		);
	}
	enumHostPid = hostPid;
	enumFoundPid = 0;
	lib!.u.EnumChildWindows(hwnd, enumCb.ptr, null);
	return enumFoundPid;
}

const baseName = (p: string) => (p.split(/[\\/]/).pop() ?? p).toLowerCase();

/** The current foreground window, or null (unavailable, nothing focused, desktop/taskbar). Never throws. */
export function foregroundWindow(): ForegroundWindow | null {
	if (!lib) return null;
	try {
		const hwnd = lib.u.GetForegroundWindow();
		if (!hwnd) return null;
		if (SHELL_CLASSES.has(windowClass(hwnd))) return null;

		pidBuf[0] = 0;
		lib.u.GetWindowThreadProcessId(hwnd, ptr(pidBuf));
		let pid = pidBuf[0]!;
		if (!pid) return null;

		const title = windowTitle(hwnd);
		let path = imagePath(pid);

		if (path && baseName(path) === "applicationframehost.exe") {
			const real = uwpChildPid(hwnd, pid);
			const realPath = real ? imagePath(real) : null;
			if (realPath) {
				pid = real;
				path = realPath;
			}
		}

		return { exe: path ? baseName(path) : "unknown", path, title, pid };
	} catch {
		return null;
	}
}
