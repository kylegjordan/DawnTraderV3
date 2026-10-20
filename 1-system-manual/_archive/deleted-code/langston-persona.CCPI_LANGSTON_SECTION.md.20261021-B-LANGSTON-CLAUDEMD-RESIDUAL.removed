# Langston Section — For CLAUDE_CODE_PROJECT_INSTRUCTIONS.md

> **Insert after the "The Three Actors" section, as a new "## Langston (Autonomous Agent)" section.**
> **Also update the Three Actors table to add Langston as a fourth actor.**

---

## Updated Three Actors Table (replace existing)

| Actor | Role | Tools |
|-------|------|-------|
| **Claude Code (You)** | Writes directives, reviews implementations, writes code changes, prepares zip packages for Replit, updates governance documents. Has read access to a local clone of the repository. Does NOT push to GitHub. | Claude Code terminal, file read/write on local clone |
| **Replit** | Applies code changes from zip packages. Runs validation. Pushes to GitHub. The ONLY actor that pushes to the repo. Replit does NOT make autonomous changes — see Replit Behavior Constraints below. | Replit Agent, bash shell, npm/node |
| **Langston** | Autonomous AI project manager on Hetzner server. Manages Replit operations (deploy, test, push), generates reports, communicates with Kyle via Telegram. Can relay messages between Kyle and Claude Code. | OpenClaw gateway (Claude Opus 4.6), Replit browser automation, Telegram, Google Drive, report-gen |
| **Kyle** | Approves directives and batch scopes, transfers zip packages between Claude Code and Replit, runs sync-repo.bat, makes decisions on ambiguities. | Google Drive, Git, File Explorer, Telegram |

---

## Langston (Autonomous Agent)

Langston is an autonomous AI agent running 24/7 on a Hetzner server. He serves as the project manager for DawnTrader, bridging Kyle, Claude Code, and Replit.

### Infrastructure
- **Server**: Hetzner CPX22 (204.168.141.77, Helsinki) — Ubuntu 24.04, 2 vCPU, 4GB RAM
- **Brain**: OpenClaw gateway running Claude Opus 4.6 (persistent systemd service, auth via Claude Max OAuth)
- **Telegram**: @LangstonDTBot — connected to "Dawn Trader HQ" forum group with 5 topics
- **Google Drive**: Mounted at `/mnt/gdrive/` via rclone (read/write access to shared drive)

### SSH Access
```
ssh -i C:\Users\kyleg\.ssh\id_ed25519 root@204.168.141.77
```

### Telegram Forum (Dawn Trader HQ)
Group chat ID: `-1003575211453`

| Topic | Thread ID | Purpose |
|-------|-----------|---------|
| General | 20 | Direct chat between Kyle and Langston |
| Claude Code Sessions | 21 | Langston <-> Claude Code exchanges |
| Replit Operations | 22 | Langston <-> Replit interactions |
| Reports | 23 | Formal Word doc reports (batch, hotfix, daily, etc.) |
| Design | 28 | New features and functionality not on the roadmap |

### 3-Way Communication (Kyle <-> Langston <-> Claude Code)

Claude Code sessions can send and receive messages through Telegram via SSH.

**Message Prefix**: All Claude Code messages MUST start with `**CLAUDE CODE SPEAKING:**` (all caps, bold).

**2-Step Send Process** (ensures Kyle sees the message AND Langston responds):
1. Broadcast for visibility: `ssh root@204.168.141.77 "openclaw message send --channel telegram --target '-1003575211453' --thread-id <THREAD_ID> --message '**CLAUDE CODE SPEAKING:** <message>'"`
2. Feed to Langston's brain: `ssh root@204.168.141.77 "openclaw agent --session-id '<UUID>' --message '**CLAUDE CODE SPEAKING:** <message>' --deliver"`

Session UUIDs change when sessions are cleared. Use `openclaw sessions --json` to get current values.

**Reading messages (Telegram -> Claude Code):**
```bash
ssh root@204.168.141.77 "cc-inbox read"        # Read unread messages
ssh root@204.168.141.77 "cc-inbox mark-read"    # Mark all as read
```

**How it works:**
- Langston writes to `/root/claude-code-inbox.json` when Kyle says "CC: Claude Code" or on significant events
- **Persistent CC**: Once "CC: Claude Code" is said in a thread, Langston CCs ALL subsequent messages until topic changes or Kyle says stop
- Claude Code sessions read the inbox via SSH at session start or when Kyle says "check Telegram"
- Only one Claude Code session is active at a time — no conflicts
- The inbox persists between sessions; new sessions pick up unread messages

### Live 3-Way Sessions

Real-time conversation mode where Claude Code actively polls the inbox every 5 seconds.

**Startup:**
1. Kyle tells Langston in Telegram: "start 3-way" → Langston activates persistent CC
2. Kyle tells Claude Code in chat: "start 3-way session"
3. Claude Code runs `ssh root@204.168.141.77 "cc-poll"` to begin polling

**During session:**
- Kyle types in Telegram → Langston CCs inbox → cc-poll detects (≤5s) → Claude Code processes and responds via 2-step send
- Round-trip: ~15-25 seconds (5s poll + 5-15s thinking + 3-5s delivery)

**Shutdown:** Kyle says "end 3-way" in Telegram, OR 15-minute idle timeout, OR Kyle tells Claude Code directly

**cc-poll**: Server-side Python script (`/usr/local/bin/cc-poll`) that polls the inbox every 5 seconds. Exits with code 0 when new messages arrive (Claude Code processes then re-launches), or code 2 on 15-minute idle timeout.

### CLI Tools on Server
| Tool | Purpose |
|------|---------|
| `report-gen` | Generate Word doc reports (batch, hotfix, daily, troubleshooting, urgent) |
| `replit-cmd` | Replit browser automation (status, shell, upload, deploy, screenshot) |
| `openclaw message send` | Send messages/files to Telegram |
| `cc-inbox` | Claude Code inbox manager (write/read/mark-read) |
| `cc-poll` | Live 3-way session inbox poller (5s interval, 15-min idle timeout) |
| `claude` | Claude Code CLI (for Langston to invoke Claude Code directly) |

### Key File Paths on Server
| Path | Purpose |
|------|---------|
| `/root/.openclaw/openclaw.json` | OpenClaw master config |
| `/root/.openclaw/workspace/` | Langston's identity (SOUL.md, IDENTITY.md, memory, skills) |
| `/root/replit-automation/` | Replit browser automation scripts |
| `/root/telegram-bot/` | Report generator, inbox CLI |
| `/root/claude-code-inbox.json` | Claude Code inbox file |
| `/mnt/gdrive/` | Google Drive mount (shared drive) |

### Langston's Capabilities
1. **Replit Operations**: Deploy batches, run tests, take screenshots, push to GitHub
2. **Report Generation**: Create Word doc reports and deliver via Telegram
3. **Web Research**: Use lynx browser and Gemini web search for research tasks
4. **Claude Code Relay**: Pass messages between Kyle and Claude Code via inbox system
5. **Project Management**: Review roadmap, suggest changes, track batch progress
6. **Design Discussions**: Participate in feature discussions in the Design forum topic

### Common Issues
- **Replit login expires**: VNC re-login required (open port 6080 temporarily)
- **Forum topic responses**: Requires OpenClaw >= v2026.3.12 (earlier versions have bug #727 that silently drops responses)
- **Web research failures**: Some sites block automated access. Langston has lynx, curl, wget available
- **Config changes**: After editing `/root/.openclaw/openclaw.json`, restart: `systemctl --user restart openclaw-gateway`

### Memory Files Reference
- **Local (Claude Code)**: `langston-infrastructure.md` in Claude Code memory folder
- **Server (Langston)**: `/root/.openclaw/workspace/memory/` — FORUM_THREADS.md, CLAUDE_CODE_COMMS.md, GOVERNANCE_RULES.md
- **Shared (Google Drive)**: `Claude Comms and Packages/Langston/` — setup docs, identity files, skills
