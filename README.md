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

## Building an installer

`bun run build:desktop` produces an NSIS installer. It needs roughly 2 GB of free disk for the release build. "Start Deep when Windows starts" only works from the installed build.

## Database

```bash
bun run db:generate   # after changing packages/db/src/schema.ts
bun run db:migrate    # or just restart the API
bun run db:studio     # browse data
```
