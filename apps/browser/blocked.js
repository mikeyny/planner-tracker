const target = decodeURIComponent(location.hash.slice(1));
let site = "";
try {
	site = new URL(target).hostname.replace(/^www\./, "");
} catch {
	site = target;
}

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

$("site").textContent = site || "this site";
document.title = `${site} · focus time`;

function matchedSite(state) {
	if (!state?.blocking) return null;
	return (
		state.sites
			.filter((s) => !state.allowed.includes(s))
			.find((s) => site === s || site.endsWith(`.${s}`)) ?? null
	);
}

function minutesLeft(session) {
	if (!session?.endsAt) return null;
	return Math.max(
		0,
		Math.ceil((Date.parse(session.endsAt) - Date.now()) / 60000),
	);
}

let reported = false;
async function render() {
	const { state } = (await send({ type: "status" })) ?? {};
	const blockedBy = matchedSite(state);
	if (!blockedBy) {
		$("title").textContent = "Your focus session is over.";
		$("sub").textContent = `${site} isn't blocked any more.`;
		$("actions").replaceChildren();
		$("actions").style.display = "flex";
		const go = document.createElement("button");
		go.className = "primary";
		go.textContent = `Open ${site}`;
		go.onclick = () => location.replace(target);
		$("actions").append(go);
		$("why").style.display = "none";
		$("hint").textContent = "";
		return;
	}
	if (!reported) {
		reported = true;
		send({ type: "blocked", site: blockedBy });
	}
	const s = state.session;
	const left = minutesLeft(s);
	$("title").textContent = s?.project
		? `This can wait. You're on ${s.project}.`
		: "This can wait.";
	const parts = [];
	if (s?.intention) parts.push(s.intention);
	if (left !== null) parts.push(`${left} min left`);
	const dot = document.createElement("span");
	dot.className = "dot";
	if (s?.color) dot.style.background = s.color;
	$("sub").replaceChildren(
		dot,
		parts.join(" · ") || "You're in a focus session.",
	);
}

$("back").onclick = async () => {
	if (history.length > 1) history.back();
	else {
		const tab = await chrome.tabs.getCurrent();
		if (tab) chrome.tabs.remove(tab.id);
	}
};

let countdown = null;
let waiting = false;
const reasonOk = () => $("reason").value.trim().length >= 3;

$("need").onclick = () => {
	$("actions").style.display = "none";
	$("why").style.display = "block";
	$("reason").focus();
	// A short wait: most urges fade if you give them a few seconds.
	let n = 10;
	waiting = true;
	$("open").disabled = true;
	$("open").textContent = `Open in ${n}s`;
	clearInterval(countdown);
	countdown = setInterval(() => {
		n -= 1;
		if (n > 0) {
			$("open").textContent = `Open in ${n}s`;
			return;
		}
		clearInterval(countdown);
		waiting = false;
		$("open").textContent = "Open for 5 minutes";
		$("open").disabled = !reasonOk();
	}, 1000);
};
$("reason").oninput = () => {
	if (!waiting) $("open").disabled = !reasonOk();
};
$("cancel").onclick = () => {
	clearInterval(countdown);
	waiting = false;
	$("why").style.display = "none";
	$("actions").style.display = "flex";
};
$("open").onclick = async () => {
	const { state } = (await send({ type: "status" })) ?? {};
	const res = await send({
		type: "allow",
		site: matchedSite(state) ?? site,
		minutes: 5,
		reason: $("reason").value.trim(),
	});
	if (res?.error) {
		$("hint").textContent = res.error;
		return;
	}
	location.replace(target);
};

render();
setInterval(render, 5000);
