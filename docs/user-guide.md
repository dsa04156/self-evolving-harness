# SEH Code CLI user guide

This guide describes the Codex-derived Rust product on `product/codex-fork`. The independent
TypeScript prototype remains available at `standalone-v0.9.0`, but its commands and provider setup
do not apply here.

## Install

Build and install the `seh` binary from this repository:

```bash
git clone --branch product/codex-fork \
  https://github.com/dsa04156/self-evolving-harness.git
cd self-evolving-harness
./scripts/install-seh.sh
```

For a faster development build:

```bash
make install-debug
```

The installer chooses an existing user binary directory when possible. Verify the result from any
directory:

```bash
command -v seh
seh --version
seh doctor --summary
```

## Sign in

SEH reuses the browser-based ChatGPT authentication managed beneath `~/.codex`. An API key is not
required, and credentials are never copied into HarnessVersion bundles or evidence records.

```bash
seh login status
seh login        # only when status says you are signed out
```

## Start coding

Open the interactive terminal UI in a project:

```bash
cd /path/to/project
seh
```

On first use in a directory, confirm whether it should be trusted. Trust permits project-local
instructions, config, hooks, and execution policies to load; decline when the directory contents
are untrusted.

You can also submit the first task immediately:

```bash
seh "Find the parser failure, fix it, and run the focused tests"
```

Useful non-interactive and session commands:

```bash
seh exec "Implement the requested change and verify it"
seh exec --json "Inspect this repository and report its test command"
seh review
seh resume --last
seh fork --last
```

Run `seh --help` or `seh <command> --help` for the complete current flag set.

## Home and slash-command UX

The startup surface shows the SEH evolution mark, current product version, model, reasoning effort,
service tier, working directory, and permission profile. Type `/` in the composer to open fuzzy
command completion. Continue typing to filter, use arrow keys to select, `Tab` to complete, and
`Enter` to run.

Core commands include:

| Command | Purpose |
| --- | --- |
| `/model` | Choose a model, reasoning effort, and supported service tier |
| `/permissions` | Inspect or change approval and sandbox settings |
| `/skills` | Browse runtime skills |
| `/agent` | Navigate primary and child-agent threads |
| `/new`, `/resume`, `/fork` | Manage durable session lineage |
| `/diff`, `/review` | Inspect and verify workspace changes |
| `/harness` | Inspect the exact HarnessVersion pinned to the session |
| `/evidence` | Inspect signed events, receipts, and the audit head |
| `/evolution` | Inspect the distinct task and harness-version lifecycles |
| `/status`, `/usage` | Inspect runtime and account status |

`Ctrl-C` clears a draft, interrupts an active operation, or exits when pressed again from an idle
empty composer. The normal Codex-derived keymap, multiline input, image attachment, skills,
subagents, hooks, plugins, MCP integrations, memories, review, and session pickers remain available.

## Models and reasoning

The TUI `/model` picker uses the live catalog. Inspect the catalog without opening the TUI:

```bash
seh models
seh models --bundled
seh models --json
```

The bundled product catalog includes GPT-5.6 Sol, Terra, and Luna plus prior models. Each entry
prints only its supported reasoning levels and service tiers. Sol and Terra currently advertise
`low`, `medium`, `high`, `xhigh`, `max`, and `ultra`; use the live output as authoritative.

Select a model at startup when needed:

```bash
seh --model gpt-5.6-sol
```

SEH never changes the selected model or reasoning effort merely to make a task faster. The active
runtime binding is captured in the session's HarnessVersion pin.

## Harness and evidence inspection

Every new session resolves a content-addressed component graph and pins one HarnessVersion before
task execution. Resume, retry, and recovery reuse that pin unless the runtime binding genuinely
changes.

```bash
seh harness
seh harness --json
seh harness --all
seh harness --thread <SESSION_ID>
```

The Evidence Plane stores hashed RuntimeEvents, range-covering receipts, an append-only audit chain,
and Ed25519 signatures. Verification is read-only:

```bash
seh evidence
seh evidence --json
seh evidence --all
seh evidence --thread <SESSION_ID>
```

A verification error returns a non-zero exit status. Do not delete or rewrite evidence to silence
the failure.

## Evolution status

Task retry is not harness evolution. Inspect the implemented boundary with:

```bash
seh evolution
seh evolution --json
```

The current command reports `not_enabled` for candidate mutation and promotion. The task loop,
versioned component graph, immutable session pin, and signed Evidence Plane are implemented;
external evaluator isolation, held-out evaluation, promotion authority, and rollback are still
gated work. Do not claim general self-improvement from this status surface.

## Permissions and trust

SEH retains the Codex-derived approval and sandbox machinery. Inspect or change the active profile
with `/permissions`; use CLI flags shown by `seh --help` for scripted runs. Treat unrestricted
filesystem/network access as an explicit high-authority mode, not a default security guarantee.

Project-local instructions and skills load only according to directory trust and runtime policy.
Evaluator, safety/permission policy, benchmark data, budgets, model identity, audit log, tool
implementations, middleware, and optimizer code remain outside the MVP mutable set.

## Diagnostics and completion

`doctor` does not spend model tokens and redacts credential material:

```bash
seh doctor --summary
seh doctor
seh doctor --json
```

Generate native completion for the installed `seh` command:

```bash
# bash
source <(seh completion bash)

# zsh
source <(seh completion zsh)

# fish
seh completion fish | source
```

## Local data

Product-specific state lives under `~/.codex/seh`:

```text
~/.codex/seh/
├── harnesses/         immutable HarnessVersion bundles
├── active/            runtime-binding active pointers
├── threads/           immutable session pins
├── evidence/threads/  events, receipts, and writer locks
└── trust/             public verification material
```

Authentication remains owned by the login layer under `~/.codex`. Never copy `auth.json`, API keys,
access tokens, cookies, or browser credentials into the repository, bug reports, evidence, or
HarnessVersion components.

## Automation contract

Prefer `--json` for scripts. `models`, `harness`, `evidence`, `evolution`, `doctor`, and the
non-interactive execution surface provide machine-readable output. Check both the process exit code
and the versioned `schemaVersion` field. Human terminal text and TUI layout are not a stable parsing
interface.
