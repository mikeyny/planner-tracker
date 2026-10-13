# Planner-Tracker — Product & Build Plan

> Working name: **Deep** (rename later). A local-first daily command centre: plan the day, enter focus, track time automatically, review honestly.

## Status (8 Oct 2026)

**Phases 0–4 are built** (Phase 4 on 9 Oct 2026). See the [README](../README.md) for how to run and test it.

Decisions taken:
- **Desktop app from day one** with Tauri 2 (tray, global quick-capture hotkey, always-on-top mini timer), not a Chrome PWA.
- **Local speech-to-text** with whisper.cpp + `large-v3-turbo` (q5_0). CPU/OpenBLAS for now because disk is tight; the CUDA build is a drop-in upgrade once ~1.3 GB is free.
- Billable flag, client and hourly rate on projects now; timesheet export stays in Phase 4.
- VS Code asks before starting a session (auto-start is a setting).
- Daily deep-work target defaults to 3h30.

Phases 0–5 are built: installer and launch at login, active-window tracking with drift nudges, site blocking (browser extension), Google Calendar (read-only iCal feed) and the Gemini Live voice coach.

---

## 1. The core idea in one sentence

**Make the next focused hour the easiest thing to start, and make every hour visible afterwards.**

Most productivity apps fail people who struggle with focus because they reward *planning* (lists grow forever) instead of *starting* and *finishing*. This app is built around one loop:

```
  Capture ──► Choose ──► Commit ──► Focus ──► Close ──► Reflect
  (dump it)   (top 3)    (timebox)  (one thing) (where I left off) (what I learned)
      ▲                                                              │
      └──────────────────────── tomorrow ◄────────────────────────────┘
```

Every feature below has to serve one of those six verbs. If it doesn't, it waits.

---

## 2. The psychology it's built on (and the feature each idea becomes)

| Principle | What the research says | What the app does about it |
|---|---|---|
| **Procrastination is emotion regulation, not laziness** (Pychyl, Sirois) | We avoid tasks that feel vague, big or unpleasant. | Every task gets a concrete **next action**. AI "**Make it smaller**" button splits scary tasks into ≤25‑min steps. A **"Just 5 minutes"** start button lowers activation energy. |
| **Self‑compassion beats self‑criticism** (Wohl et al., 2010) | Forgiving yourself for procrastinating *reduces* future procrastination. | No red "overdue" shaming. Missed tasks roll over with a gentle "still want this?" prompt. Streaks use **"never miss twice"**, not all‑or‑nothing. |
| **Implementation intentions** (Gollwitzer) | "When X, I will Y" triples follow‑through vs. vague goals. | Each focus session starts with a one‑line **intention**: *"In this 50 min I will ___."* Day plan commits tasks to specific times. |
| **Zeigarnik effect** | Unfinished tasks keep intruding on your mind. | A **Parking Lot**: hotkey to capture any thought mid‑session without leaving focus. It's emptied at the next break. **Brain dump** at the start of the day gets everything out of your head. |
| **Attention residue** (Sophie Leroy) | Switching tasks leaves part of your attention behind. | The app enforces **one active session at a time**. Ending a session asks for a 1‑line **"where I left off"** note, which is shown to you the next time you open that project. Context switches are counted. |
| **Planning fallacy** (Kahneman, Buehler) | Everyone underestimates. | Estimate vs. actual is recorded for every task. The app learns **your personal multiplier** per project ("you take 1.6× your estimates on SMP") and warns when the day is over‑committed. |
| **Parkinson's law** | Work expands to fill the time available. | Timeboxes. A task has a budget; the timer shows it running out. |
| **Ultradian rhythm / attention limits** | Deep focus comes in roughly 90‑minute cycles, and breaks restore it. | Several timer modes (see §4.4), and breaks are enforced with real break suggestions (move, water, eyes off screens). |
| **Progress principle** (Amabile) | Small, visible wins are the strongest daily motivator. | A **Done list** next to the to‑do list, a daily focus ring, and a "wins" summary at shutdown. |
| **Goal gradient** | Effort increases as the goal gets closer. | Progress ring toward a daily deep‑work target (e.g. 4h). |
| **Time blindness** | Without external cues, time "disappears". | A **visual shrinking disc** timer (Time Timer style), a "now" line on the day timeline, optional soft chime every 15 min. |
| **Fresh start effect** (Dai & Milkman) | New weeks and months boost motivation. | Monday **weekly planning** ritual and a monthly reset view. |
| **Shutdown ritual** (Cal Newport) | Formally closing the day stops work from leaking into rest. | End‑of‑day: review → move leftovers → pick tomorrow's top 3 → "Shutdown complete". |
| **Distraction is internal first** (Nir Eyal, *Indistractable*) | Most distractions start with an internal urge. | One‑key **distraction log** ("urge: check WhatsApp") during focus. Weekly view shows your top triggers. |
| **Body doubling** | Working "alongside" someone improves focus for many people. | Phase 5: optional AI voice check‑in at session start/end ("What are you working on? … Nice, see you in 50."). |

Design rule from all of this: **reduce decisions at the moment of starting.** The app decides defaults; you just press play.

---

## 3. Your daily flow (what using it actually feels like)

### 08:30 — Start My Day (≈5 min, guided)
1. **Brain dump**: press the mic and talk: *"Today I need to finish the SMP payment webhook, reply to the agri‑ledger client, and the cloudlyte landing page needs a new hero…"*
2. Gemini turns the dump into **tasks**, matched to projects, with estimates, energy type (deep / shallow / admin) and next actions. You confirm or edit.
3. **Pick your top 3** (the "big rocks"). Everything else goes to *Later today* or *Inbox*.
4. **Timebox**: drag the top 3 onto the day timeline. Deep work goes into your best hours, which the app learns from your history.
5. Reality check: *"You planned 7h10m of work into 5h of free time. With your usual 1.4× overrun that's ~10h. Drop something?"*
6. **Commit** and the first session starts with one click.

### During the day — Focus sessions
- Press **▶** on a task. Full‑screen focus view: task, intention, big timer, parking lot.
- **Pop‑out mini timer** that stays on top of VS Code (Document Picture‑in‑Picture in Chrome, or a Tauri window later).
- Open the project in **VS Code** and the session can start automatically. Close the folder or go idle and it pauses and asks what happened.
- On break: the parking lot is shown so you can triage it, then a break suggestion.

### 17:30 — Shutdown (≈3 min)
- Today's timeline, planned vs actual.
- Unfinished tasks: carry over, reschedule or drop (no guilt).
- 3 quick questions: *What went well? What got in the way? Energy 1–5?*
- AI writes a 3‑line summary; tomorrow's top 3 are picked now.
- "Shutdown complete ✓", and the app goes quiet.

### Monday — Weekly review (≈15 min)
Hours per project vs targets, best focus hours, top distractions, estimate accuracy, wins. AI drafts the review; you set next week's project budgets.

---

## 4. Feature catalogue

Priority: **P1** = MVP, **P2** = next, **P3** = later, **P4** = nice‑to‑have.

### 4.1 Projects
- P1 Name, colour, icon/emoji, status (active / paused / archived).
- P1 **Linked folders**: one or more repo paths (e.g. `C:\Users\nyama\Documents\dev\techvest\smp`). This is how VS Code activity maps to projects.
- P2 Weekly time budget/target ("SMP: 12h/week") with a progress bar.
- P2 Client and billable flag with an hourly rate, for Techvest client work.
- P2 "Where I left off" note shown on the project card.
- P3 Auto‑import: scan `Documents/dev/techvest/**` for repos and suggest projects.

### 4.2 Tasks
- P1 Title, project, estimate (minutes or 🍅 count), status, done‑at.
- P1 Lists: **Inbox**, **Today**, **Later**, **Done**.
- P1 Top‑3 flag for "big rocks".
- P2 Next action, energy type (deep / shallow / admin), subtasks, notes (markdown).
- P2 Due date, recurrence (daily standup, weekly invoices).
- P2 AI: **Make it smaller**, **Estimate for me** (from your history), **What's the first step?**
- P3 Rollover tracking: if a task has been carried over 3+ times, the app asks whether to break it down, delegate or delete it.

### 4.3 Day planner
- P1 Today view: top 3, then the rest, then done.
- P2 **Timeline**: drag tasks into time blocks, with a now‑line and available hours.
- P2 Over‑commit warning using your personal estimate multiplier.
- P3 Google Calendar import (meetings block time; needs internet).

### 4.4 Focus engine (the heart)
- P1 Modes:
  - **Pomodoro** 25/5, long break after 4.
  - **Deep block** 50/10 or 90/20.
  - **Flowtime**: no fixed end; break = work ÷ 5 (good when you're in flow and a bell would break it).
  - **Custom / Timebox** ("I'm giving this project 1 hour").
  - **Just 5 minutes**: starts tiny; at 5 min it asks "keep going?".
- P1 Server‑authoritative timer: state lives in the DB, so a refresh, crash or reboot never loses time.
- P1 Pause/resume, and an end‑session outcome: done / progress / blocked, plus a "where I left off" note.
- P1 Session intention (one line).
- P1 **Parking lot** quick capture (hotkey `Ctrl+Shift+Space` in the app).
- P2 Visual disc timer, full‑screen focus mode, soft chimes.
- P2 **Distraction log** (one key: internal urge vs external interruption).
- P2 Pop‑out always‑on‑top mini timer (Document PiP).
- P2 Ambient sound: brown noise, rain, café, bundled locally so it works offline.
- P2 Break coach: suggests a real break activity and shows the parking lot to triage.
- P3 End‑of‑session self‑rating (focus quality 1–5) that feeds insights.

### 4.5 Automatic tracking
- P2 **VS Code extension** (small, TypeScript):
  - Sends heartbeats to the local API: workspace folder, active file, language, git branch, window focused or not, typing activity.
  - Folder ↔ project mapping comes from the project's linked folders.
  - **Status bar item**: `● SMP · 23:41 left`. Click to pause or stop, or `Start focus` from the command palette.
  - Rules (configurable): opening a linked folder with no session running prompts "Start a session on SMP?" (or auto‑starts). Closing the workspace or 10 min idle **pauses** the session. VS Code idle for 20 min **ends** it and asks you to confirm the time.
  - If you're in a session for *Project A* but editing *Project B*, it nudges: "Switch session to B?"
- P2 **Idle detection**: back after 12 min away, choose keep / discard / count as break.
- P3 **Window activity agent** (in the local API, Windows only): samples the foreground window title and app every 5s. Lets you see where time went (VS Code, Chrome tab titles, WhatsApp…) and spot distractions. Stored locally only.
- P3 Git correlation: commits per project per day shown on the timeline.
- P4 Browser extension for site tracking and optional **site blocking** during focus (YouTube, X, etc.).

### 4.6 Insights (dashboard)
- P1 Today: focus time, sessions, tasks done, per‑project breakdown.
- P2 Week: hours per project vs budget, deep vs shallow ratio, daily focus trend.
- P2 **Estimate accuracy** per project (your multiplier).
- P3 **Best hours heatmap** (hour × weekday, coloured by focus quality), used to suggest when to schedule deep work.
- P3 Distraction triggers, context switches per day, longest unbroken focus streak.
- P3 Client timesheet export (CSV/PDF) for billable projects.

### 4.7 GenAI (Gemini)
- P2 **Voice brain dump → tasks**: record in the browser, send the audio straight to Gemini (it accepts audio, so no separate speech‑to‑text step), get structured JSON (tasks, project match, estimate, energy, next action), then confirm.
- P2 **Natural‑language command bar** (`Ctrl+K`): "start 50 min on smp webhook", "add task to cloudlyte: fix hero copy, 30 min", "what did I do yesterday?"
- P2 Make it smaller, estimate, first step (see Tasks).
- P3 AI daily plan suggestion: given tasks, estimates, calendar, energy history and best hours, it proposes a timeline you can accept or edit.
- P3 Shutdown and weekly review summaries.
- P4 Voice **planning coach** (Gemini Live API): a real‑time conversation for planning the day, and body‑doubling check‑ins.
- Guardrails: the AI only **proposes**, you confirm before anything is written. Every call is logged (prompt, tokens, cost) in `ai_runs`. The key stays in local `.env` only.

### 4.8 Gamification (lite, deliberately)
- P2 Daily focus ring and a forgiving streak ("never miss twice").
- P3 Weekly "personal bests" (longest focus, most tasks shipped).
- No points, leaderboards or levels. They reward gaming the system rather than doing the work.

### 4.9 Quality of life
- P1 Keyboard‑first: `N` new task, `S` start, `Space` pause, `Ctrl+K` command bar.
- P1 Dark‑first calm UI with an accent colour per project.
- P2 Desktop notifications (break over, session ending, shutdown time).
- P3 Daily DB backup (pg_dump to a folder, kept 14 days).
- P3 Installable PWA, so it opens like an app.
- P4 Tauri desktop shell: tray icon, global hotkeys, launch at login, native always‑on‑top timer.

---

## 5. Architecture

Matches your usual stack (smp / agri‑ledger): **Bun monorepo, Hono, Drizzle, Postgres in Docker, React + Vite + Tailwind v4, Biome, lucide‑react, @google/genai.**

```
planner-tracker/
├─ apps/
│  ├─ web/            React + Vite + Tailwind v4 (PWA)       :5180
│  ├─ api/            Bun + Hono + Drizzle, WebSocket hub     :4040
│  │                  ├─ timer engine (server‑authoritative)
│  │                  ├─ heartbeat ingest (VS Code, idle)
│  │                  ├─ window‑activity sampler (Windows, P3)
│  │                  └─ AI service (Gemini)
│  └─ vscode/         VS Code extension (heartbeats + status bar)
├─ packages/
│  ├─ db/             Drizzle schema + migrations
│  └─ shared/         zod schemas, types, timer math
├─ docker/
│  └─ docker-compose.yml   postgres:16‑alpine on :5434
└─ docs/PLAN.md
```

**Why the API runs on the host, not in Docker:** it needs to see your desktop (foreground window, idle time) and be reachable by the VS Code extension at `localhost`. Postgres stays in Docker, as you asked. Port **5434** avoids clashing with smp's Postgres on 5432.

**Real‑time:** the API pushes timer state over WebSocket, so the web app, the pop‑out timer and the VS Code status bar always agree.

**Offline:** everything except AI works with no internet: local DB, bundled fonts and sounds, no CDN. AI features show "offline" and queue or disable gracefully. (Optional later: local Whisper or Ollama fallback.)

**Auth:** single user on localhost, so no login. The API binds to `127.0.0.1` only. The VS Code extension uses a local token from `.env`.

### Startup
- `docker compose up -d` (Postgres, `restart: unless-stopped`), then `bun dev`.
- Later: a Windows Task Scheduler entry starts the API at login, so tracking always works.

---

## 6. Data model (first draft)

```
projects        id, name, color, icon, status, client, billable, hourly_rate,
                weekly_target_min, left_off_note, created_at
project_paths   id, project_id, path                     -- VS Code mapping
tasks           id, project_id, title, notes, next_action, status(inbox|today|later|done|dropped),
                is_top3, energy(deep|shallow|admin), estimate_min, due_date, recurrence,
                parent_task_id, rollover_count, sort_order, done_at, created_at
day_plans       id, date, intention, planned_min, available_min, started_at, shutdown_at,
                energy_rating, went_well, got_in_way, ai_summary
time_blocks     id, day_plan_id, task_id, start_at, end_at              -- planned
sessions        id, project_id, task_id, mode, planned_min, intention,
                started_at, ended_at, active_sec, outcome(done|progress|blocked),
                left_off_note, focus_rating, source(manual|vscode|auto)
session_pauses  id, session_id, paused_at, resumed_at, reason(manual|idle|vscode_closed|break)
captures        id, session_id, text, kind(parking|distraction_internal|distraction_external),
                triaged_to_task_id, created_at
activity_events id, source(vscode|window|idle), project_id, app, title, file, branch,
                ts, duration_sec                                         -- raw heartbeats
reviews         id, kind(daily|weekly), period_start, data(jsonb), ai_summary
ai_runs         id, feature, model, input_tokens, output_tokens, cost_usd, ok, created_at
settings        key, value(jsonb)
```

The rule: **sessions = what you intended; activity_events = what actually happened.** Insights compare the two.

---

## 7. Look & feel

- **Mood:** calm, dark‑first, quiet confidence. Think *Linear* × *Things* × *Session*. No busy dashboards. Each screen has one obvious next action.
- **Focus screen:** almost empty. Large disc timer, task title, intention line, a small parking‑lot field. Project accent colour glows softly.
- **Type:** a characterful sans for UI and a mono for timers. Self‑hosted via @fontsource (you already use this in cloudlyte).
- **Motion:** gentle and purposeful. The timer disc drains smoothly and a task check‑off gets a satisfying micro‑animation (progress principle). Respects reduced‑motion.
- Main screens: **Today**, **Focus**, **Projects**, **Insights**, **Review**, plus the **Command bar**.

---

## 8. Build roadmap

> ⚠️ Honest warning: building a productivity system is a classic way to *feel* productive while avoiding the real work. So **Phase 1 should be usable within 1–2 days**, and you should run your actual work through it before adding more. Let real friction choose Phase 2.

| Phase | Goal | Scope | Rough effort |
|---|---|---|---|
| **0 — Foundation** | Runs locally | Monorepo scaffold, Docker Postgres, Drizzle schema, Biome, `bun dev` | ½ day |
| **1 — Core loop (MVP)** | Use it tomorrow | Projects, tasks (Inbox / Today / Done, top 3), focus timer (Pomodoro / Deep / Timebox / Just 5 min), server‑side sessions, parking lot, "where I left off", today stats, keyboard shortcuts | 1–2 days |
| **2 — Rituals + AI** | Start and end the day well | Start My Day wizard, voice brain dump to tasks (Gemini), Make it smaller, Shutdown ritual, timeline planner, over‑commit warning, mini PiP timer, sounds | 2–3 days |
| **3 — Auto‑tracking** | Stop forgetting to press play | VS Code extension (heartbeats, status bar, auto start/pause), idle detection, distraction log | 2 days |
| **4 — Insights** | Learn about yourself | Weekly dashboard, estimate multiplier, best‑hours heatmap, weekly review + AI summary, client timesheet export, backups | 2 days |
| **5 — Desktop & extras** | Always there | Tauri shell (tray, global hotkeys, launch at login), window‑activity sampler, site blocking, Google Calendar, voice coach | later |

---

## 9. Decisions to make before building

1. **Form factor for v1:** web app in Chrome + local API (recommended, fastest, and it upgrades to Tauri later), or desktop app from day one?
2. **Client billing:** should v1 support billable time and timesheet export for Techvest clients, or is this purely personal focus?
3. **VS Code behaviour:** auto‑start sessions when a linked folder opens, or only *prompt*? (Recommendation: prompt. Auto‑start tracks time you didn't intend to spend.)
4. **Daily deep‑work target:** a starting number (suggest 3–4h; it can be adjusted from data later).
5. **Gemini key:** put it in `apps/api/.env` as `GEMINI_API_KEY` (git‑ignored) when we reach Phase 2. No need to paste it in chat.

---

## 10. Setup notes (current machine state, 2026‑10‑08)

- Docker Desktop is installed but **not running**. Start it before Phase 0.
- Bun 1.3.5, Node 22.16, VS Code 1.139 are available.
- smp's Postgres uses host port 5432, so this project uses **5434**.
