const $ = (id) => document.getElementById(id);

chrome.runtime.sendMessage({ type: "status" }).then(({ state, error }) => {
	if (!state) {
		$("head").textContent = "Deep isn't running";
		$("line").textContent =
			error ?? "Start the Deep app. Nothing is blocked while it's closed.";
		return;
	}
	const s = state.session;
	if (!state.blocking) {
		$("head").textContent = "Connected to Deep";
		$("line").textContent = state.enabled
			? "Sites open normally. Distracting sites are blocked during focus sessions."
			: "Site blocking is off in Deep's settings.";
		return;
	}
	const dot = document.createElement("span");
	dot.className = "dot";
	if (s?.color) dot.style.background = s.color;
	$("head").replaceChildren(
		dot,
		`Focusing${s?.project ? ` on ${s.project}` : ""}`,
	);
	const left = s?.endsAt
		? Math.max(0, Math.ceil((Date.parse(s.endsAt) - Date.now()) / 60000))
		: null;
	const count = state.sites.length - state.allowed.length;
	$("line").textContent =
		`Blocking ${count} site${count === 1 ? "" : "s"}${left !== null ? ` for ${left} more min` : " until the session ends"}.`;
	for (const site of state.sites) {
		const li = document.createElement("li");
		li.textContent = state.allowed.includes(site)
			? `${site} (allowed for now)`
			: site;
		$("sites").append(li);
	}
});
