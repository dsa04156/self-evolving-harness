---
name: seh-cli
description: Operate, diagnose, and inspect the SEH Code coding-agent CLI. Use when a task asks to launch SEH, verify its installation or ChatGPT login, enumerate supported models and reasoning tiers, inspect the active versioned harness or signed evidence stream, run a non-interactive coding task, or report the current evolution capability without overstating it.
---

# SEH CLI

Use the installed `seh` executable as the stable entry point. It is a standalone Codex-derived Rust coding-agent product, not a wrapper that launches another CLI.

## Preflight

Run these read-only checks first when the environment is unknown:

```bash
command -v seh
seh --version
seh login status
seh doctor --json
```

Never print credential files or token values. Browser-based ChatGPT login does not require an API key. If login is missing, run `seh login` and let the user complete the browser flow.

## Choose a model

Inspect the live model catalog instead of guessing identifiers or reasoning tiers:

```bash
seh models
seh models --json
seh models --bundled
```

In the TUI, use `/model` for interactive selection. Preserve the user's selected reasoning tier and service mode unless the user asks to change them.

## Run the agent

Launch the full-screen coding-agent interface with:

```bash
seh
```

Run an automation-friendly task with:

```bash
seh exec --json "<task>"
```

Use `seh --help` or `seh <command> --help` before composing an unfamiliar mutation command. Do not invent flags.

## Inspect harness state and evidence

Prefer JSON for automation and human output for terminal walkthroughs:

```bash
seh harness --json
seh evidence --json
seh evolution --json
```

`harness` verifies the selected component bundle and pin. `evidence` performs read-only hash-chain and signature verification. `evolution` reports capability status; do not describe retry, reflection, or prompt reinjection as harness evolution. Candidate generation and promotion are not available unless the command explicitly reports them enabled.

Inside the TUI, use `/harness`, `/evidence`, and `/evolution` for the corresponding status surfaces. Use `/` to discover all current slash commands.

## Output contract

When another program consumes output, request `--json`, check the process exit code, and treat field names as the stable interface. Summarize verification failures without hiding them. Do not mutate harness pins, evidence, permissions, or credentials merely to make a diagnostic pass.
