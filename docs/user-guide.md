# CLI user guide

`seh` is a standalone coding agent. It constructs context, calls the selected model, executes its own
workspace tools, verifies the result, and persists signed session evidence. It does not launch Codex,
Gajae-Code, OpenCode, or another agent harness.

## Install

The CLI supports Node.js 22 or newer. Deterministic release verification is pinned to Node.js
24.18.1 and npm 11.18.0. Linux also needs Bubblewrap at `/usr/bin/bwrap`.

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

## Local no-key setup

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
| `seh init` | Bind configuration to the canonical current workspace |
| `seh run "TASK"` | Execute one coding task and print the final answer and evidence summary |
| `seh chat` | Read prompts interactively; each prompt is a new linked session |
| `seh sessions` | List recent sessions for this workspace |
| `seh status [ID]` | Inspect the latest or selected session |
| `seh resume ID [GUIDANCE]` | Start a new child session using the prior outcome as context |
| `seh doctor` | Check the sandbox, provider endpoint, and selected model |
| `seh config` | Print the non-secret project configuration and its state path |
| `seh memory add` | Add an operator-approved project fact, preference, or lesson |
| `seh memory list` | Show persistent memory and generated session summaries |
| `seh demo` | Run the deterministic fake-provider end-to-end demo |

Use another workspace from any directory with `--workspace /absolute/or/relative/path`. A task may
also arrive through standard input:

```bash
printf '%s\n' 'Diagnose why the focused test fails' | seh run --read-only
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

`resume` and successive `chat` prompts create new auditable child sessions. They reuse workspace and
memory, but they do not create a `HarnessVersion` and are not recorded as harness evolution.

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
- A session was interrupted or blocked: inspect `seh status ID`, then use
  `seh resume ID "recovery guidance"`. This creates a new trace while preserving the failed one.
