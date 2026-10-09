const PORT = import.meta.env.API_PORT || "4040";
export const API_URL = `http://127.0.0.1:${PORT}`;
export const TOKEN: string = import.meta.env.DEEP_TOKEN || "";

export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
	) {
		super(message);
	}
}

async function request<T>(
	method: string,
	path: string,
	body?: unknown,
): Promise<T> {
	const isForm = body instanceof FormData;
	// Never leave a button spinning forever if the API restarts mid-request.
	const timeoutMs = isForm ? 150_000 : 45_000;
	let res: Response;
	try {
		res = await fetch(`${API_URL}/api${path}`, {
			method,
			headers: {
				"X-Deep-Token": TOKEN,
				...(body && !isForm ? { "Content-Type": "application/json" } : {}),
			},
			body:
				body === undefined ? undefined : isForm ? body : JSON.stringify(body),
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (err) {
		if (err instanceof DOMException && err.name === "TimeoutError")
			throw new ApiError(
				"The local API took too long to answer. Try again.",
				0,
			);
		throw new ApiError(
			"Can't reach the local API. It may still be starting.",
			0,
		);
	}
	const text = await res.text();
	const data = text ? JSON.parse(text) : null;
	if (!res.ok)
		throw new ApiError(
			data?.message ?? `Request failed (${res.status})`,
			res.status,
		);
	return data as T;
}

export const api = {
	get: <T>(path: string) => request<T>("GET", path),
	post: <T>(path: string, body?: unknown) =>
		request<T>("POST", path, body ?? {}),
	put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
	patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
	del: <T>(path: string) => request<T>("DELETE", path),
	upload: <T>(path: string, form: FormData) => request<T>("POST", path, form),
};
