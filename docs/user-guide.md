# CLI user guide

`seh` is a standalone coding agent. It constructs context, calls the selected model, executes its own
workspace tools, verifies the result, and persists signed session evidence. It does not launch Codex,
Gajae-Code, OpenCode, or another agent harness.

## Install

The CLI supports Node.js 22 or newer. Deterministic release verification is pinned to Node.js
24.18.1 and npm 11.18.0. Linux also needs Bubblewrap at `/usr/bin/bwrap`.

```bash
npm install --global github:dsa04156/self-evolving-harness
seh
```

To build from source instead:

```bash
git clone https://github.com/dsa04156/self-evolving-harness.git
cd self-evolving-harness
npm ci
npm run link:cli
seh help
```

If global npm links are unavailable, build and invoke the tracked launcher directly:

```bash
npm run build
/path/to/self-evolving-harness/bin/seh.js help
```

## Provider setup

SEH ships three executable provider routes. They all feed the same SEH-owned context builder,
agent loop, tool executor, verifier, evidence stream, and session lifecycle.

| Provider | Transport | Model source | Credential |
| --- | --- | --- | --- |
| OpenAI | Responses API | curated current/prior coding models | `OPENAI_API_KEY` |
| OpenRouter | Chat Completions | live tool-capable catalog (currently 250+) | `OPENROUTER_API_KEY` |
| Ollama | local `/api/chat` | installed models plus curated local examples | none |

Catalog references: [OpenAI models](https://developers.openai.com/api/docs/models),
[OpenRouter Models API](https://openrouter.ai/docs/api/api-reference/models/get-models),
[OpenRouter tool calling](https://openrouter.ai/docs/guides/features/tool-calling), and the official
[Ollama model library](https://ollama.com/library). Curated entries were checked on 2026-08-04;
live discovery remains authoritative for what an endpoint currently advertises.

Provider keys are read from the process environment only. A browser or Codex CLI login is not
reused: doing so would couple this independent runtime to another harness's private credential
store. Use `/model` to switch provider and model together. The selected model, reasoning effort,
and service tier are saved in project configuration and apply to each newly created task session.

### Local no-key provider

Install [Ollama](https://docs.ollama.com/quickstart), then start it and fetch the default model:

```bash
ollama serve
ollama pull qwen2.5-coder:7b
```

The model download is several gigabytes. A different installed tool-capable model can be selected
with `--model`.

```bash
cd /path/to/project
seh init --model qwen2.5-coder:7b --verify "npm test"
seh doctor
seh run "Implement the requested feature and add focused tests"
```

`seh run` auto-initializes an unconfigured workspace with the local defaults. `seh init` is still the
recommended first command because it records the permission and verification choices explicitly.

## Commands

| Command | Purpose |
| --- | --- |
| `seh` | Start the interactive coding-agent shell |
| `seh "TASK"` | Open the interactive shell and submit an initial prompt |
| `seh init` | Bind configuration to the canonical current workspace |
| `seh run "TASK"` | Execute one coding task and print the final answer and evidence summary |
| `seh exec "TASK"` | Alias for the non-interactive `run` command |
| `seh chat` | Explicit form of the interactive coding-agent shell |
| `seh continue [PROMPT]` | Open the shell with the latest session loaded |
| `seh sessions` | List recent sessions for this workspace |
| `seh status [ID]` | Inspect the latest or selected session |
| `seh resume [ID] [GUIDANCE]` | Pick or load a prior session and continue interactively |
| `seh doctor` | Check the sandbox, provider endpoint, and selected model |
| `seh config` | Print the non-secret project configuration and its state path |
| `seh harness` | Show the latest task's content-addressed HarnessVersion and runtime snapshot |
| `seh evolution` | Show observed traces and distinct executed versions without starting a mutation |
| `seh memory add` | Add an operator-approved project fact, preference, or lesson |
| `seh memory list` | Show persistent memory and generated session summaries |
| `seh completion bash\|zsh\|fish` | Generate native shell completion |
| `seh demo` | Run the deterministic fake-provider end-to-end demo |

Common profile flags are `--model MODEL`, `--effort auto|none|minimal|low|medium|high|xhigh|max`,
and `--fast` for OpenAI models that advertise priority processing. Repeat `--skill ID` to add
bundled workflow skills to a non-interactive task.

Use another workspace from any directory with `--workspace /absolute/or/relative/path`. A task may
also arrive through standard input:

```bash
printf '%s\n' 'Diagnose why the focused test fails' | seh run --read-only
```

## Interactive shell

Running `seh` with no arguments enters an alternate-screen terminal application. The original
terminal contents return when SEH exits. The header remains fixed while the transcript scrolls, and
the command palette and session picker open as keyboard-driven overlays:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ SEH v0.7.0  SELF-EVOLVING CODING AGENT                                      │
│ my-project     openai/gpt-5.6-sol · HIGH · FAST · WRITE · agents 4 · skills 1│
└──────────────────────────────────────────────────────────────────────────────┘

                       ● ╭────── TASK EXECUTION ──────╮ ·
                          context → model → tools → verify
                              ╲    ◈  S E H  ◈    ╱
                          traces → attribute → version → gate
                       · ╰───── HARNESS EVOLUTION ─────╯ ●
             ◆ IMMUTABLE TRUST · evaluator · policy · audit · LOCKED ◆

                Ready in my-project · describe a task or press /
       /model route  /agent delegate  /resume history  /review diff  /tools authority

 ╭────────────────────────────────────────────────────────────────────────────╮
 │ ❯                                                                          │
 ╰────────────────────────────────────────────────────────────────────────────╯
  Shift+Enter newline · PageUp transcript · / commands                   ready
```

Recent user and assistant turns are supplied to the next model call as bounded, explicitly
untrusted thread context. The human-facing task remains unchanged in the durable session record.
Each prompt still creates a separate event stream and parent-linked session.

Typing `/` opens the palette immediately. Keep typing to filter, use `↑`/`↓` to select, `Tab` to
complete, and `Enter` to run. Arrow keys recall prompt history when the palette is closed. Paste
directly into the composer; `Shift+Enter` inserts a newline. `PageUp` and `PageDown` navigate the
transcript. `Ctrl-C` clears the draft or interrupts an active turn, `Ctrl-L` returns home, and
`Ctrl-D` exits when the draft is empty. The editor accounts for wide Korean/CJK characters when
moving the cursor.

| Slash command | Purpose |
| --- | --- |
| `/help` | Show all interactive commands |
| `/new` | Clear the current thread context without deleting workspace memory |
| `/status`, `/sessions` | Inspect durable session state |
| `/resume [ID] [guidance]` | Pick or load a prior task and answer, optionally run guidance |
| `/model [model-id]`, `/models` | Search providers and live/curated model routes, or select an exact ID |
| `/effort [LEVEL\|auto]`, `/reasoning` | Pick a model-advertised reasoning level or use the provider default |
| `/fast [on\|off]` | Toggle OpenAI priority processing for models that advertise it |
| `/permissions`, `/read-only`, `/write` | Inspect or temporarily change tool authority |
| `/verify` | Show the external verifier commands |
| `/diff [--staged]` | Show Git diff through the no-network sandbox |
| `/review [focus]` | Run a focused review turn with temporary read-only authority |
| `/tools` | Inspect every model-callable tool under the active authority |
| `/skills [id\|off]`, `/skill` | Search, enable, disable, or clear workflow skills |
| `/agent TASK` | Ask the parent loop to spawn, wait for, and integrate a bounded child agent |
| `/job COMMAND` | Start and wait for a backend command in the no-network shell sandbox |
| `/agents`, `/jobs` | Show descendant limits, inherited authority, and cleanup behavior |
| `/context` | Show bounded thread and model context limits |
| `/harness` | Show the latest pinned HarnessVersion and runtime snapshot IDs |
| `/evolution` | Show task-trace/version readiness and the separate evolution contract |
| `/memory` | Show persistent memory records |
| `/paste` | Show the direct-paste and `Shift+Enter` multiline shortcut |
| `/clear`, `/home`, `/exit` | Redraw the workspace home or close the shell |

Use `//` when a task itself must begin with `/`. `/model`, `/effort`, and `/fast` persist the model
execution profile. Interactive permission changes remain ephemeral; use `seh init --force ...` to
change stored authority.

### Model picker

Run `/model` with no argument to open the provider-aware registry. The current route is always first,
followed by useful examples across OpenAI, OpenRouter, and Ollama. SEH then adds installed local
models and refreshes OpenRouter's public catalog, retaining only text-output models that advertise
tool calling. The current live catalog contains more than 250 routes across OpenAI, Anthropic,
Google, DeepSeek, Qwen, Mistral, xAI, and other vendors.

Selecting an entry opens a second picker containing only that route's advertised reasoning levels.
For GPT-5.6 Sol, Terra, and Luna this is `Low`, `Medium`, `High`, `Extra high`, then `More
reasoning… → Max`. The chosen `(provider, model, effort, service tier)` profile is saved and applies
to the next newly created task session. A running turn is never rebound in place. Previous task sessions remain immutable;
only their bounded, untrusted plain-text answer can enter later conversational context, never their
provider-native assistant state, tool-call envelope, or tool results. A checkmark means the model was
returned by live discovery, not that the current account is entitled to use it. A circle marks a
curated catalog entry. Each provider also has its own `Enter another model ID` row.

```text
╔══════════════════════════════════════════════════════════════════╗
║  Model registry · 293 routes                                     ║
║  type provider or model · ↑↓ select · Enter apply · Esc cancel  ║
║  Search                                                          ║
║  › ● Ollama      Qwen2.5-Coder 7B       current                  ║
║    ○ OpenAI      GPT-5.6 Sol            current flagship         ║
║    ○ OpenAI      GPT-5.6 Terra          balanced                 ║
║    ○ OpenRouter  OpenAI GPT-5.6 Sol     routed                   ║
║    ○ OpenRouter  Anthropic Claude       routed                   ║
║    ○ Ollama      Qwen3-Coder 30B        local                    ║
╚══════════════════════════════════════════════════════════════════╝
```

`/effort` reopens the effort picker for the active model. `/effort auto` clears the explicit level.
`/fast` toggles the `priority` service tier only on direct OpenAI routes that advertise it. SEH does
not show a fake `Ultra` provider level: Codex implements Ultra as `Max` inference plus proactive
multi-agent delegation, which is a separate orchestration behavior.

Start typing anywhere in the picker to filter its labels and descriptions. `Esc` clears a non-empty
search first and closes the picker on the next press. Search matches provider name, display name,
and exact model ID. A selected entry may still need provider access or local installation. Saved
model-profile changes are visible in the fixed header, `seh config`, and every new session's
immutable `executionProfile` evidence.

### Skills, child agents, and backend jobs

New v2 configurations allow four descendant starts per task by default. Existing configurations
preserve their prior frozen budget; enable or change the cap explicitly with
`seh config --max-descendants 4`.

`/skills` opens a searchable catalog of bundled workflows: `debug`, `review`, `tests`, `refactor`,
`docs`, `secure-review`, `performance`, and `parallel-research`. A selected skill applies to
following turns in the current terminal thread. It is inserted into model context, recorded in the
session's `activeSkillIds`, and included in that session's content-addressed HarnessVersion. Resume
restores the selected skills that remain available under the current authority.

```bash
seh run --skill debug --skill tests "Fix the parser crash and add a regression test"
```

The default config permits four descendant starts per task. `spawn_agent` creates a one-shot child
with the same pinned provider, model profile, HarnessVersion, workspace, verifier, and memory policy.
Its model/tool/token use is charged to both its reduced slice and the parent budget. Its tool grant
can only shrink, and its descendant cap is zero, so it cannot recursively spawn another agent.

`start_job` runs a shell command asynchronously in the same workspace-only, empty-environment,
no-network Bubblewrap sandbox as `bash`. Both kinds return an ID immediately. The parent must use
`wait_job` before relying on the result. Terminal results are stored as content-addressed artifacts;
any still-running child or command is cancelled and reaped when the parent task ends. `/agent` and
`/job` are convenient prompt-level shortcuts for these model tools; they do not bypass the task
session, permissions, budget, or evidence lifecycle.

`seh harness` and `/harness` expose the exact content-addressed execution identities saved after a
task. `seh evolution` and `/evolution` are read-only projections: they count observed traces and
distinct HarnessVersions and restate the candidate gate. They intentionally do not turn one failed
task into an automatic prompt rewrite. Candidate mutation remains in the separate governed
Evolution Control Plane, where attribution, isolated evaluation, matched budgets, and an append-only
promote/reject/rollback decision are mandatory.

### Shell completion

```bash
# bash
source <(seh completion bash)

# zsh
source <(seh completion zsh)

# fish
seh completion fish | source
```

## Permissions

The default `workspace-write` profile exposes:

- UTF-8 `read`, `write`, and exact `edit`
- sandboxed `bash`
- read-only `git status` and `git diff`
- bounded `spawn_agent` and backend-job coordination (four starts by default)

The shell sees the selected workspace at `/workspace`, a read-only host system, an empty environment,
a temporary home, and no network. It can still make broad or destructive changes inside the selected
workspace. Keep the repository under version control and review its diff.

For diagnosis without mutation:

```bash
seh run --read-only "Review the authentication implementation for correctness"
```

`--write` and `--read-only` override the stored profile for one invocation. Recreate the stored
configuration with `seh init --force --read-only` or `seh init --force --write`.

## Verification

Repeat `--verify` to configure more than one command:

```bash
seh init --force \
  --verify "npm run check" \
  --verify "npm test"
```

Verification commands run in a separate no-network Bubblewrap process after the model proposes
completion. A failed verifier returns feedback to the task loop within the fixed retry budget.

With no configured command, the verifier is advisory: it records a hashed Git-status observation and
accepts completion. Advisory success must not be interpreted as tests passing.

## Sessions, memory, and resume

Configuration and durable state are outside the target repository:

```text
~/.local/state/self-evolving-harness/
└── projects/<workspace-hash>/
    ├── config.json
    ├── memory/
    ├── sessions/
    └── skills/
```

Set `SEH_STATE_DIR` to choose another state root. Configuration and session metadata are written with
owner-only permissions. Provider keys are never part of the configuration.

Add stable context explicitly:

```bash
seh memory add --namespace project_facts "The authoritative test command is npm test"
seh memory add --namespace user_preferences "Prefer minimal diffs"
seh memory list
```

`continue`, `resume`, and successive interactive prompts create new auditable child sessions. They reuse the
workspace, persistent memory, and bounded thread context, but they do not create a `HarnessVersion`
and are not recorded as harness evolution.

## Remote providers

The OpenAI adapter is opt-in and requires an API key supplied only through the environment:

```bash
export OPENAI_API_KEY='...'
seh init --force --provider openai --model 'gpt-5.6-sol' --effort high --fast --verify "npm test"
seh run "Fix the failing tests"
```

No API key is needed for Ollama or the deterministic demo. The CLI never writes
`OPENAI_API_KEY` to config, memory, events, or session metadata.

OpenRouter exposes many vendors through one tool-capable adapter:

```bash
export OPENROUTER_API_KEY='...'
seh init --force --provider openrouter --model 'anthropic/claude-sonnet-5' --effort high --verify "npm test"
seh run "Fix the failing tests"
```

The key is sent only to the pinned `https://openrouter.ai/api/v1` endpoint. Custom endpoint changes
fail configuration validation. SEH never writes `OPENROUTER_API_KEY` to configuration, memory,
events, session metadata, or model-catalog cache.

## Troubleshooting

- `Cannot reach Ollama`: run `ollama serve` and confirm the configured endpoint with `seh config`.
- `model ... is not installed`: run `ollama pull MODEL`, then `seh doctor`.
- `/usr/bin/bwrap is unavailable`: install the Linux `bubblewrap` package. The runtime fails closed;
  it does not silently execute an unsandboxed shell.
- `Project is already initialized`: use the existing config or replace it explicitly with
  `seh init --force ...`.
- A session was interrupted or blocked: inspect `seh status ID`, then use `seh resume` for the
  picker, `seh resume --last`, or `seh resume ID "recovery guidance"`. Each creates a new trace while
  preserving the failed one.
