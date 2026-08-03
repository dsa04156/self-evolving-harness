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
| `seh memory add` | Add an operator-approved project fact, preference, or lesson |
| `seh memory list` | Show persistent memory and generated session summaries |
| `seh completion bash\|zsh\|fish` | Generate native shell completion |
| `seh demo` | Run the deterministic fake-provider end-to-end demo |

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
│ SEH v0.4.0  SELF-EVOLVING CODING AGENT                                      │
│ my-project                    provider/model · WORKSPACE WRITE                │
└──────────────────────────────────────────────────────────────────────────────┘

                       ● ╭────── TASK EXECUTION ──────╮ ·
                          context → model → tools → verify
                              ╲    ◈  S E H  ◈    ╱
                          traces → attribute → version → gate
                       · ╰───── HARNESS EVOLUTION ─────╯ ●
             ◆ IMMUTABLE TRUST · evaluator · policy · audit · LOCKED ◆

                Ready in my-project · describe a task or press /
       /resume history  /review diff  /skills workflow  /tools authority

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
| `/model [model-id]`, `/models` | Search discovered and example models, or select an exact ID |
| `/permissions`, `/read-only`, `/write` | Inspect or temporarily change tool authority |
| `/verify` | Show the external verifier commands |
| `/diff [--staged]` | Show Git diff through the no-network sandbox |
| `/review [focus]` | Run a focused review turn with temporary read-only authority |
| `/tools`, `/skills` | Inspect the active tools and repository workflow skill |
| `/context` | Show bounded thread and model context limits |
| `/memory` | Show persistent memory records |
| `/paste` | Show the direct-paste and `Shift+Enter` multiline shortcut |
| `/clear`, `/home`, `/exit` | Redraw the workspace home or close the shell |

Use `//` when a task itself must begin with `/`. Interactive model and permission changes are
intentionally ephemeral; use `seh init --force ...` to change stored configuration.

### Model picker

Run `/model` with no argument to open the provider-scoped picker. The current model is always first.
For a local provider, SEH probes the configured endpoint and places models actually returned by the
provider before curated coding-model examples. For OpenAI, the picker shows the current model plus
role-preserving flagship, balanced, and fast examples; account availability is deliberately not
assumed. `+ Enter another model ID` accepts any exact ID supported by the active provider.

```text
╔══════════════════════════════════════════════════════════════════╗
║  Select model · OPENAI                                           ║
║  type to filter · ↑↓ select · Enter apply · Esc cancel           ║
║  Search                                                          ║
║  › ● gpt-5.6-terra      current · configured                     ║
║    ○ gpt-5.6-sol        example · flagship coding and agents     ║
║    ○ gpt-5.6-luna       example · fast, high-volume tasks        ║
║    + Enter another model ID                                      ║
╚══════════════════════════════════════════════════════════════════╝
```

Start typing anywhere in the picker to filter its labels and descriptions. `Esc` clears a non-empty
search first and closes the picker on the next press. A selected example may still need provider
access or local installation. Model changes made here are session-only.

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

## Optional OpenAI provider

The OpenAI adapter is opt-in and requires an API key supplied only through the environment:

```bash
export OPENAI_API_KEY='...'
seh init --force --provider openai --model '<model-id>' --verify "npm test"
seh run "Fix the failing tests"
```

No API key is needed for Ollama or the deterministic demo. The CLI never writes
`OPENAI_API_KEY` to config, memory, events, or session metadata.

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
