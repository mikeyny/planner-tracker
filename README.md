# Deep

A local-first focus planner for Windows: plan the day by talking, focus on one thing at a time, and let VS Code and idle detection keep the time log honest. The product plan and the research behind it are in [docs/PLAN.md](docs/PLAN.md).

Everything runs on this machine. Only the optional Gemini features need internet.

## Run it

```bash
bun install
bun run db:up      # Postgres 16 in Docker on 127.0.0.1:5434 (restarts with Docker)
bun run app        # desktop app; it starts the local API itself if it isn't running
```

`bun run dev` starts the API in watch mode and the desktop app together, which is handier when editing API code.

Docker Desktop must be running. If Postgres is down, the API runs `docker start deep_postgres` and waits for it. Migrations are applied automatically on API start.

### First steps in the app

1. **Projects → New project.** Link each project to its repo folder (for example `C:\Users\nyama\Documents\dev\techvest\smp`). This is how VS Code time is matched to projects.
2. **Start my day.** Talk or type, review the tasks, star three, and drag them onto the timeline.
3. Press **S** to start a focus session, **Space** to pause, **E** to end, **Esc** to leave the focus screen.

## Keyboard

| Key | Where | Does |
|---|---|---|
| `Ctrl+Shift+Space` | anywhere in Windows | Quick capture (thought, inbox task or urge) |
| `Ctrl+K` | app | Command palette (and AI commands when Gemini is set) |
| `N` | app | New task |
| `S` | app | Start a focus session |
| `Space` | app | Pause / resume |
| `F` | app | Open / close the focus screen |
| `E`, `U`, `I` | focus screen | End session, log an urge, log an interruption |
| `Ctrl+1…5` | app | Today, Inbox, Projects, Stats, Settings |
| `Ctrl+Alt+C` | VS Code | Capture a thought |

Closing the main window hides it to the tray so tracking keeps running. Quit from the tray menu.

## Layout

```
apps/api       Bun + Hono API on 127.0.0.1:4040 (timer engine, idle watcher, VS Code rules, Whisper, Gemini)
apps/desktop   Tauri 2 + React 19 + Tailwind 4: main window, always-on-top mini timer, quick-capture window
apps/vscode    VS Code extension "Deep Focus": heartbeats, status-bar timer, start/switch prompts
packages/db    Drizzle schema and migrations (Postgres)
packages/shared Types, timer maths and settings shared by every app
docker/        docker-compose for Postgres
tools/whisper  whisper.cpp binaries and model (git-ignored, see below)
```

All API calls need the `X-Deep-Token` header from `.env`. The API also writes `~/.deep/connection.json`, which the VS Code extension reads to find it.

## Speech to text (local Whisper)

Voice brain dumps are transcribed on this PC by [whisper.cpp](https://github.com/ggml-org/whisper.cpp) with the `large-v3-turbo` model (q5_0, 574 MB). The app records 16 kHz audio and sends it in ~20-second chunks cut at pauses, so text appears while you talk.

- Current build: CPU with OpenBLAS (`tools/whisper/bin`, 61 MB). About 6–7 s per chunk on the i9-13900H.
- The server starts on first use, keeps the model loaded, and stops after 15 idle minutes to free about 1 GB of RAM.
- Test it: `bun run whisper:test` (uses `tools/whisper/sample.wav`).

**GPU upgrade (RTX 4060).** Transcription would drop to under a second per chunk with the CUDA build. It needs about 1.3 GB of extra disk: download `whisper-bin-win-cuda-12.4.0-x64.zip` from the whisper.cpp releases, extract its `Release` folder over `tools/whisper/bin`, and restart the API. The CUDA 11.8 build doesn't work here on its own because it expects cuBLAS to be installed separately.

To re-download from scratch:

```bash
mkdir -p tools/whisper && cd tools/whisper
curl -L -o w.zip https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-blas-bin-x64.zip
unzip w.zip && mv Release bin && rm w.zip
curl -L -o ggml-large-v3-turbo-q5_0.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
```

## Gemini (optional)

Add `GEMINI_API_KEY=...` to `.env` and restart the API. That enables smarter task extraction (projects, estimates, energy, first steps, top-3 picks), **Make it smaller**, AI commands in `Ctrl+K`, and the shutdown summary. Without a key each feature falls back to a simple offline version. The model is set by `GEMINI_MODEL` (default `gemini-2.5-flash`). Every call is logged in the `ai_runs` table.

## VS Code extension

```bash
bun run install:vscode   # builds, packages and installs deep-focus.vsix
```

Reload VS Code afterwards. The status bar shows the running session; click it for pause, +10 min, capture, urge and end. Behaviour is set in **Settings → Automatic tracking**:

- Opening a linked folder with no session running: ask (default), auto-start once you start editing, or off.
- Closing the project's last VS Code window pauses the session; reopening it resumes.
- Editing a different project during a session offers to switch (at most every 30 min per project).
- No keyboard or mouse input for 10 minutes pauses the session. When you come back you choose keep, count as break, discard, or end (after 20 minutes away).

## Insights (Phase 4)

- **Stats → Week**: focus per day against your daily target, projects against their weekly targets, deep-work share, project switches, when you get pulled away, and a best-focus-hours heatmap from the last 4 weeks (uses the 1–5 rating you give when ending a session).
- **Weekly review** (sidebar; a dot and a Monday–Wednesday banner when last week isn't reviewed): last week's numbers, three questions, an AI summary (plain summary from your numbers if Gemini is unavailable), and next week's hours per project. Weeks with no tracked focus are skipped.
- **Timesheets** (Projects → Timesheets, or the file icon on a billable project): preview by week or month, export CSV or a printable PDF. Hours are focused session time; amounts use the project's hourly rate.
- **Find projects** (Projects): lists repos under your projects folder (Settings; defaults to the folder above this repo) that aren't linked yet, and adds the ones you pick.
- **Commits on the timeline**: ◆ marks on the right edge of Today's timeline show your own commits (by your global git email) in linked repos.
- **Slipping tasks**: Start my day flags a task that has been moved twice already and offers Make it smaller.

## Backups

A gzipped `pg_dump` is written to `~/.deep/backups/deep-YYYY-MM-DD.sql.gz` once a day while the API runs (Settings → Backups also has **Back up now**). The newest 14 are kept by default.

Restore one (this replaces the current data):

```bash
gunzip -c ~/.deep/backups/deep-2026-10-09.sql.gz | docker exec -i deep_postgres psql -U deep -d deep
```

## Tests

```bash
bun run test        # unit tests for the insight calculations (no database needed)
```

End-to-end tests run against a separate `deep_test` database and a second API on port 4050, so they never touch your data. Start the two test servers in their own terminals, then run everything:

```bash
docker exec deep_postgres createdb -U deep deep_test   # once
bun run e2e:api     # test API on :4050 (DEEP_TEST=1: no backups, idle watcher or VS Code file)
bun run e2e:ui      # test front-end on :5181
bun run e2e         # seeds deep_test, runs API tests, reseeds, runs UI tests in headless Chrome
```

UI screenshots land in `apps/desktop/e2e/out`. The seed refuses to wipe any database whose name doesn't end in `_test` unless you pass `--yes`.

## Building an installer

`bun run build:desktop` produces an NSIS installer. It needs roughly 2 GB of free disk for the release build. "Start Deep when Windows starts" only works from the installed build.

## Walkthrough video

`video/` is a Remotion project that renders a narrated, ~4.5-minute walkthrough of every feature from real screenshots of the app: `video/out/deep-walkthrough.mp4`.

```bash
bun run video:studio        # preview and scrub in the browser
bun run video:render        # render video/out/deep-walkthrough.mp4
```

- Narration text lives in `video/src/script.ts`; subtitles are generated from it.
- `bun run --filter @deep/video voiceover` regenerates narration with Gemini TTS (free tier: ~10 requests per model per day). `bun video/scripts/vo-check.ts` checks each clip against the script with local Whisper.
- Screenshots in `video/public/shots` were taken from the real app with demo data from `bun run --filter @deep/video seed:demo <morning|midday|active|reset>`. **The seed wipes the database it points at**, so it only runs against a `*_test` database unless you add `--yes`.

## Database

```bash
bun run db:generate   # after changing packages/db/src/schema.ts
bun run db:migrate    # or just restart the API
bun run db:studio     # browse data
```
