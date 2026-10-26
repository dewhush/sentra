# Harness feature census — Sentra reference

Catatan riset fitur harness/agent populer untuk acuan roadmap Sentra.
Sumber: docs resmi masing-masing (diakses 2026-10-27).

## omp (omp.sh) — "coding agent with the IDE wired in"

- Native Rust core, TUI interaktif (transcript + composer + status line)
- Model roles: role assignment persistent (main/fast/deep/planning), quick-switch
- Thinking level cycling (Shift+Tab), Auto effort
- Run modes: Plan, Goal, Vibe, Prewalk, Loop, Fast
- Sessions: resume, branch, fork, tree navigation (/tree), export, share, handoff
- Compaction (/compact), memory + hindsight memory
- Subagents (parallel, steerable while running), Collab (shared live session)
- Code intelligence via LSP; live debugging via DAP
- Hashline edits (hash-anchored), structural/AST edits
- Skills, project rules, MCP + extension authoring
- RPC mode + SDK + CLI one-shot (scripting/CI)
- Shell/Python escape prefixes (!, !!, $, $$) — dengan exclude-from-context variant
- Steering mid-turn vs queued follow-up (Enter vs Ctrl+Q); pending-message strip
- Prompt history search (Ctrl+R), $VISUAL editor escape (Ctrl+G)
- @file mention dengan fuzzy search, image/paste attachment chips
- Approvals: Yolo / Always ask, per-tool policy, question dialogs multi-tab
- Status line: model, thinking, mode, git state, context use, cost, session name
- Browser-control tool bawaan; GitHub context
- Unicode-safe redraw (Alt+L), retry failed turn (Alt+R), continue (.) 

## Claude Code (Anthropic)

- Surfaces: terminal CLI, VS Code/Cursor/JetBrains plugin, desktop app, web, mobile
- CLAUDE.md project memory + auto memory; AGENTS.md fallback
- Skills (/review-pr style packages), plugins (hooks + MCP + subagents bundleable)
- Hooks: command/HTTP/MCP-tool/LLM-prompt/subagent triggers di lifecycle points; async hooks
- Subagents: frontmatter config, custom model, autoCompactWindow; lead agent coordination
- Agent view: multiple background agents satu layar; Workflows (dynamic orchestration, env var untuk model)
- Plan mode; approval controls; permission policies
- MCP servers (elicitasi hooks, policy blocking)
- /schedule (cloud + desktop scheduled tasks), /loop (in-session repeat)
- Remote Control (lanjut session dari HP), Channels (Telegram/Discord/iMessage/webhook → session)
- Dispatch (task dari phone → desktop session), teleport (--teleport web→local), /desktop handoff
- /review GitHub code review otomatis; GitHub Actions + GitLab CI integrations
- Slack @Claude → PR; Chrome integration untuk debug live web app
- Agent SDK (build custom agents pakai tools Claude Code)
- CLI pipeable Unix-style (`tail app.log | claude -p "..."`)

## OpenAI Codex CLI (0.164)

- Rust TUI; /init (AGENTS.md generator), /status
- Skills + plugins (connect team tools); /presets: 10 numbered slots reusable prompts + keyboard menu
- /review: dedicated reviewer — presets: base branch (PR style) / uncommitted / commit / custom instructions; read-only terhadap working tree
- Subagents (delegate focused work, findings balik ke main session)
- codex exec non-interactive ( scripting/CI)
- codex resume (recent per-repo + search across chats), checkpoints git best practice
- --image input, paste image ke composer; --search live web (visible di transcript)
- codex cloud: submit work ke cloud environment, apply result ke repo lokal
- codex mcp: add/auth/inspect server+tools sebelum dipakai; enabled/disabled_tools per server
- /permissions mid-session; sandbox: bubblewrap (Linux), landlock/seccomp; network proxy feature
- execpolicy rules + approval reviews (auto review denials, /approve retry)
- Auto reviewer (deny dangerous commands), /experimental toggles
- /fast mode (GPT-5 fast), vim mode, themes, shell completions (codex completion)
- Turn lifecycle: steer mid-flight (input injection), interrupt

## OpenCode (sst/anomalyco)

- TUI + desktop + IDE (VS Code/JetBrains ext) + headless server mode
- Primary agents (Tab switch): Build (full access) / Plan (read-only); custom via JSON atau markdown (yaml frontmatter: model, temperature, permission, prompt)
- Subagents: General (multi-step), Explore (fast read-only); invoke via @mention
- Permission config per agent/tool: allow/ask/deny (edit, bash, webfetch, ...)
- LSP integration: diagnostics as feedback (V2: config only, runtime WIP)
- Hidden system agents: compaction, title generation, session summary
- Session tree navigation: child sessions (Leader+Down masuk, Left/Right cycle, Up parent)
- doom_loop tool: recovery prompts saat agent stuck
- question tool: agent boleh nanya user (single/multi-select)
- .opencode/plans/ plan files; experimental plan mode writes plan file
- 75+ providers via models.dev; BYOK
- LSP-powered goto-definition context (opsional per tool)

## DeepSeek Harness (dsh)

- Desktop app + Web UI (npx @deepseek-ai/dsh web); open source (github deepseek-ai/deepseek-harness)
- "Everything is a plugin" (Cordis architecture): tools, skills, UI = plugins
- Creator mode: bikin plugin lewat chat (agent writes+installs+verifies plugin live)
- Plugin manager UI (official/installed), plugin bundles
- Agent teams (experimental), auto approval review (experimental), scheduled tasks (weekly cron-style, timezone aware) (experimental), voice input (experimental)
- Terminal panel plugin (node-pty PTY real di Web UI, ConPTY di Windows)
- Trajectory view: dev tool inspect execution traces (turn/step/tool/timing/schema)
- File previews (docx/xlsx/html/pdf/md), diff review per turn
- / commands, @ files, session picker di composer
- Model picker inline (DeepSeek-V4.1-Flash dsb), reasoning effort selector (High)

## Gemini CLI → Antigravity CLI (June 2026 transition)

- Extensions (bundle: MCP servers + skills + commands), extensions marketplace
- Agent Skills; subagents (experimental) + remote subagents
- Checkpointing: auto snapshot sebelum file edit (restore/rewind)
- /rewind: rewind + replay sessions; session management resume
- Plan mode (read-only), sandboxing (tool isolation), policy engine (fine-grained execution control)
- Hooks (scripts di events), .geminiignore, GEMINI.md hierarchy, system prompt override
- Model routing (auto fallback), model selection, token caching
- Headless mode (scripting), IDE companion, MCP servers (client+server)
- Themes, custom slash commands, enterprise config, trusted folders
- Telemetry (usage/perf), memport (multi-source memory import)

## Warp (agentic development environment)

- Agent Mode vs terminal mode, auto-detection input (label magenta "(autodetected)")
- Multi-agent orchestration: Warp's own SOTA agent + run Claude Code/Codex/Gemini CLI in parallel panes
- Warp Drive: shared workflows/notes; environment context (knows toolchain)
- ADE configurability: pure terminal → minimal agent (diff view + file tree) → full IDE-like
- Open-sourced agentic dev environment (April 2026); cloud agents + local agents
- Contextual prompt suggestions; agent teams with task delegation; PR/triage tracking

## Aider

- Git-native: /undo, auto-commits per change, repo map (tree-sitter context ranking)
- Multi-model via litellm (BYOK/Ollama/OpenRouter); architect/editor dua-model workflow
- Voice-to-code; image+URL add to chat; watch-files mode (AI comments dari editor)
- Lint/test hooks after edit (auto-fix errors), /run + /test command output to context
- Analytics (--analytics), scripting/scripted retries, watch mode, browser UI

## Crush (Charm)

- TUI glamour-based, multi-session tabs, MCP toggle in-session, LSP integration
- Provider switching live, permissions per-tool, session rename/resume
- Compact footprint, focused review QoL releases

## Cross-harness patterns (relevan buat Sentra)

1. PTY terminal + transcript cards (tool call expand/collapse) — semua
2. Steering mid-turn vs queue follow-up — omp, Codex, Claude Code
3. Session persistence: resume/branch/fork/tree — omp, Claude Code, Codex, Gemini (checkpoint/rewind), OpenCode
4. Plan mode read-only → approve → execute — omp, OpenCode, Gemini, Codex review
5. Subagents parallel + steerable + summary back to parent — semua kecuali Aider
6. Skills/commands reusable (markdown) — Claude Code, omp, Gemini, DeepSeek, Codex presets
7. MCP standard integrasi tools — semua kecuali Aider (litellm only)
8. Hooks (lifecycle events → shell/HTTP) — Claude Code, Gemini, omp (extensions)
9. Approvals/sandbox bermartabat: allow/ask/deny per tool + sandbox tech — Codex, OpenCode, Gemini policy engine, Claude Code
10. Multi-surface: CLI + desktop + web + mobile (Claude Code, DeepSeek, Warp; Sentra = desktop orchestrator niche)
11. Review workflow dedicated (diff-only, no working-tree touch) — Codex /review, Claude /review
12. Handoff antar agent/session — omp handoff, Claude teleport/dispatch, DeepSeek agent teams (inti Sentra)
13. Cost/context meter di status line — omp, Claude Code, Gemini
14. Checkpoint/rewind sebelum edit — Gemini, Codex (git), Aider (/undo)
