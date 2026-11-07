# Code Room

**Your AI agents, working together in the same room.** Code Room runs on your own computer, brings together the command-line AIs you already use (Codex, Claude Code and Gemini/Antigravity) and lets one hand its work to the next. Nothing leaves without your approval.

> Português: veja o [README.md](README.md).

If Code Room helps you, **[leave a star ⭐](https://github.com/Igorferreirax/code-room-open)** so others can find it.

## What it does
- **One room, many agents.** Each agent has a name, role, provider and live status, shown as a pixel-art office, a list or a Canvas.
- **Hand-offs between agents.** The finished work of one becomes the task of the next, with a summary and files. On the Canvas, drag from one agent to another to link them. Round trips are limited, and the loop stops when someone writes "SEM PENDÊNCIAS" (no pending items).
- **Teams.** Developer → reviewer flow, with a supervisor plan validated by the backend.
- **Approval before anything goes out.** The preview waits in `AGUARDANDO_APROVACAO/<CHANNEL>`. *Approve* delivers the package to `POSTAR_<CHANNEL>`. *Ask for changes* redoes only what you point out. *Reject* moves everything to `LIXEIRA` (trash; nothing is deleted for good). Nothing is published on its own.
- **Routines.** By schedule, manual, or when a file appears.
- **Honest usage.** Whatever the provider does not report shows as "unavailable" (`indisponível`), never as zero or invented.
- **Talk to an agent right where it sits.** Click an agent (in the Room or on the Canvas) to open a small bubble next to it: status, what it is doing live, and a box to give it a mission on the spot. *Pin to window* moves the chat to a side window; up to 3 agents side by side.
- **Connect other tools (MCP).** Claude Code, Codex and others can query Code Room (and, if you allow it, create tasks) with their own revocable token. Approving and deleting are never exposed. See [docs/MCP.md](docs/MCP.md).
- **Browser for agents (optional, off).** Per agent: a separate throwaway browser (Claude Code and Codex) or your own Chrome (Claude Code only).
- **Hermes on your own server (VPS).** Set server, port and key in Connections and test the connection; the key contents never leave your computer.
- **Feels like a Windows app.** Its own window and icon, a tray icon, start with Windows, and an option to keep the PC awake while a task runs.
- **On your phone.** QR pairing (one-time code, per-device token, revocable) over the local network or Tailscale. **Off** by default.
- **Guided first run.** On a fresh install, a triage checks which AIs (Codex, Claude Code, Gemini) are installed and signed in, shows the exact command to install or log in, and creates starter agents in one click. A step-by-step tour then presents the 12 screens. You can **skip** at any time and replay it from the user menu › Guia de boas-vindas.
- **Local and private.** The service only listens on `127.0.0.1`. It uses the CLIs you are already logged into; Code Room never stores or shows credentials.

The interface is in Brazilian Portuguese for now.

## Requirements
- Windows 10 or 11.
- Node.js 24 or later (tested on 26). The Windows portable zip bundles Node: see [INSTALAR.md](INSTALAR.md) (in Portuguese).
- At least one of these CLIs, logged in: Codex (`codex login`), Claude Code (`claude auth login`) or Antigravity/Gemini.
- Optional: Python 3, ffmpeg and HyperFrames, for the video batch mode.

## Download and run (Windows)
1. Download the **portable zip** from the [Releases page](https://github.com/Igorferreirax/code-room-open/releases/latest) and extract it anywhere.
2. Double-click `Iniciar-Code-Room.cmd`. Code Room opens in its own window and ships with Node: nothing to install.
3. On first run, a check shows which AIs (Codex, Claude Code, Gemini) you already have and what is missing.

`Setup.exe` is also on the Release, but it is **not code-signed yet**: Windows 11 with Smart App Control blocks it. Prefer the zip.

## Get started (from source)
```bash
git clone https://github.com/<your-user>/code-room.git
cd code-room
npm start
```
On Windows you can also double-click `Iniciar-Code-Room.cmd`. The access key lives in `.data/access.key` and is never committed.

## Tests
```bash
npm test          # backend and screen tests (no browser)
npm run audit     # real attacks against an isolated service
npm run check     # syntax of every file
npm run test:ui   # browser script (needs Chrome and Playwright for Python)
```
No test calls an AI provider or spends quota.

## Known limits
- Windows only for now.
- **Batch mode** (video pipeline) is an **example pipeline** born from a video channel: it depends on a skill, scripts and tools (ffmpeg, HyperFrames, ElevenLabs) you must have. See `server/batches.mjs`. Generalizing it is on the [roadmap](docs/ROADMAP.md).
- Remote access needs the computer on with Code Room open.
- The Canvas touch test in `test:ui` is flaky.

## License and credits
[MIT](LICENSE). Built by [Bytelab](https://www.agenciabytelab.com.br).
