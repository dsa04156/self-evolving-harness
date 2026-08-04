<p align="center">
  <img src="assets/hero-product.webp" alt="SEH coding-agent execution and harness-evolution loops above an immutable trust foundation" width="100%" />
</p>

<h1 align="center">SEH — Self-Evolving Harness</h1>

<p align="center">
  <strong>A standalone coding agent that owns the runtime—and evolves it under evidence.</strong><br />
  Code, tools, memory, sessions, verification, and governed harness evolution in one terminal product.
</p>

<p align="center">
  <a href="https://github.com/dsa04156/self-evolving-harness/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/dsa04156/self-evolving-harness/ci.yml?branch=main&style=flat-square&label=CI"></a>
  <img alt="Version 0.5.0" src="https://img.shields.io/badge/version-0.5.0-a78bfa?style=flat-square">
  <img alt="Node 22 or newer" src="https://img.shields.io/badge/node-%E2%89%A522-22d3ee?style=flat-square">
  <img alt="Standalone runtime" src="https://img.shields.io/badge/runtime-standalone-34d399?style=flat-square">
  <img alt="Research alpha" src="https://img.shields.io/badge/status-research_alpha-f59e0b?style=flat-square">
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#the-terminal-is-the-product">Terminal UX</a> ·
  <a href="#what-seh-owns">Capabilities</a> ·
  <a href="#two-real-lifecycles">Evolution</a> ·
  <a href="docs/user-guide.md">CLI guide</a> ·
  <a href="ARCHITECTURE.md">Architecture</a>
</p>

## Install

SEH runs its own agent loop. It does not launch Codex CLI, Gajae-Code, OpenCode, or another harness behind the scenes.

```bash
npm install --global github:dsa04156/self-evolving-harness
```

Then open any repository:

```bash
cd your-project
seh
```

Requirements: Linux, Node.js 22+, Git, and Bubblewrap. Run `seh doctor` to check the machine and see the [provider setup guide](docs/user-guide.md#provider-setup) before the first real task.

Build from source instead:

```bash
git clone https://github.com/dsa04156/self-evolving-harness.git
cd self-evolving-harness
npm ci
npm run link:cli
seh
```

## The terminal is the product

<p align="center">
  <img src="assets/terminal-demo.svg" alt="SEH terminal home with task execution, harness evolution, immutable trust, and prompt composer" width="100%" />
</p>

Starting `seh` takes over the terminal's alternate screen, like a modern coding-agent CLI. A fixed workspace header, scrollable transcript, activity line, command overlays, and multiline composer stay in one stable layout; exiting restores the original terminal contents. The home screen shows the selected model, current authority, verification configuration, and recent durable threads before the first prompt.

Type `/` and the command palette appears immediately:

- fuzzy command filtering as you type;
- `↑` / `↓` selection and `Tab` completion;
- command descriptions and argument hints in place;
- prompt history with arrow-key recall;
- a keyboard-driven session picker for `/resume`;
- a searchable `/model` registry spanning direct OpenAI, 250+ live tool-capable OpenRouter routes,
  installed local models, curated examples, and exact custom IDs;
- `Shift+Enter` multiline editing and native bracketed paste;
- `PageUp` / `PageDown` transcript navigation;
- Korean and wide-character-aware cursor positioning;
- `Ctrl-C` to clear input, `Ctrl-L` for home, and `Ctrl-D` to exit;
- a readable response panel with verification and usage evidence.

Common interactive commands:

| Command | Action |
| --- | --- |
| `/new` | Start a clean conversation thread |
| `/resume` | Open the session picker or resume by ID |
| `/sessions` | List recent durable sessions |
| `/status` | Show lifecycle, usage, and verification evidence |
| `/diff` | Inspect the sandboxed workspace diff |
| `/review` | Review current changes through a temporary read-only turn |
| `/tools` / `/skills` | Inspect the active runtime surface |
| `/context` | Show bounded thread and model context limits |
| `/model` | Search providers and 250+ tool-capable model routes |
| `/permissions` | Inspect the active authority profile |
| `/read-only` / `/write` | Change authority for following turns |
| `/memory` | Inspect persistent project memory |
| `/verify` | Show external verification commands |

Shell completion is built in too:

```bash
# bash
source <(seh completion bash)

# zsh
source <(seh completion zsh)

# fish
seh completion fish | source
```

## Use it

Interactive work:

```bash
seh                                      # open the home screen
seh "Fix the authentication regression"  # open with an initial task
seh continue                             # continue the latest thread
seh resume                               # choose a durable session
seh resume --last                        # resume the newest session
```

Automation and one-shot work:

```bash
seh run "Add focused tests for the parser"
seh exec --read-only "Review this repository"
seh -p "Explain the current Git diff"
```

Initialize explicit workspace policy when you want the model, write authority, and verifier recorded before the first task:

```bash
seh init --model YOUR_MODEL --write --verify "npm test"
seh doctor
seh
```

Configuration, session evidence, and project memory live outside the target repository under `~/.local/state/self-evolving-harness/`. Provider secrets are read from the process environment and are never persisted in configuration, sessions, events, or memory.

## What SEH owns

This is an independent coding-agent runtime, not a controller around someone else's agent.

| Surface | Runtime ownership |
| --- | --- |
| Model | Provider contract, request loop, model identity, usage accounting |
| Context | System prompt, bounded history, memory, skills, tools, overflow policy |
| Tools | Guarded `read`, `write`, exact `edit`, `bash`, Git status and diff |
| Sessions | Durable lineage, interrupt, resume, recovery, validation, retirement |
| Memory | Filesystem persistence with explicit namespace and authority |
| Workflow | Routing, skills, subagents, backend jobs, inherited budgets |
| Permissions | Read-only/workspace-write modes and Bubblewrap process isolation |
| Evidence | Structured runtime events, receipts, artifacts, and append-only audit chains |
| Verification | External sandboxed commands and deterministic fake verifiers |
| Evolution | Attribution, bounded mutation, isolated evaluation, promotion, rejection, rollback |

The normal task path is fully owned by SEH:

```text
prompt → context → model → tool call → tool result → verifier → completion or bounded retry
```

## Two real lifecycles

Retrying a failed prompt is not self-evolution. SEH represents task execution and harness evolution as separate state machines.

<p align="center">
  <img src="assets/hero.svg" alt="Separate SEH task and harness-evolution lifecycles" width="100%" />
</p>

### Task execution loop

One pinned `HarnessVersion` solves one task through model calls, guarded tools, verification, and bounded recovery. Retrying, reflecting, resuming, or updating session memory stays inside this lifecycle.

### Harness evolution loop

Evidence from multiple executions is mined for recurring weaknesses. A proposal must identify a bounded component, create a new content-addressed `HarnessVersion`, evaluate it independently in an isolated Git worktree, and record one explicit decision:

```text
traces → weakness mining → attribution → bounded mutation → candidate
       → held-in + held-out evaluation → promote / reject / rollback
```

The proposer cannot mutate the evaluator, safety and permission policy, benchmark split, budget, model identity, audit log, promotion policy, tool implementation, middleware, or optimizer code in the MVP.

## Six planes, one trust boundary

```text
┌──────────────────────────────────────────────────────────────────┐
│ 1  Agent Runtime Kernel       model · context · tools · sessions │
│ 2  Harness Component Plane    versioned component graph          │
│ 3  Operations Control Plane   start · observe · recover · retire │
│ 4  Evidence Plane             events · receipts · artifacts      │
│ 5  Evolution Control Plane    mine · attribute · mutate · gate   │
├──────────────────────────────────────────────────────────────────┤
│ 6  Immutable Trust Plane      evaluator · policy · budget · audit│
└──────────────────────────────────────────────────────────────────┘
```

The evaluator runs as a separate process with reduced authority. Candidate worktrees cannot read sealed data or alter immutable components. Qualification and deployment are separate: approving a candidate does not silently move the active pointer.

Read [ARCHITECTURE.md](ARCHITECTURE.md), the [threat model](SECURITY.md), and the [rendered diagram set](docs/diagrams/README.md) for the full contracts.

## Current status

SEH is a working research alpha, not a finished empirical claim.

| Area | Status |
| --- | --- |
| User coding-agent CLI | Implemented: home, command palette, sessions, memory, tools, permissions, verification |
| Deterministic standalone runtime | Implemented and covered by fake-model/fake-tool tests |
| Versioned harness registry | Implemented |
| Worktree-isolated bounded mutation | Implemented prototype |
| External evaluator and audit trail | Implemented deterministic boundary |
| Fair B0–B6 real-provider experiment | Not run |
| General self-improvement claim | Not claimed |

Run the deterministic release gate:

```bash
npm run verify:release
```

It type-checks and builds the runtime, runs the deterministic suite, compiles every frozen JSON Schema, executes the no-network managed demo, and verifies development, publication, historical-publication, and trust-plane evidence.

## Repository map

```text
src/product/       terminal UX, product config, sessions, coding-agent assembly
src/runtime/       provider loop, context, tools, memory, skills, workflow
src/harness/       component graph and version registry
src/operations/    session lifecycle and recovery
src/evidence/      runtime events, receipts, artifacts, audit records
src/evolution/     attribution, proposals, candidates, evaluation, promotion
src/trust/         immutable authorities and evaluator boundary
schemas/           cross-process JSON contracts
evaluator/         separately launched evaluator processes
benchmarks/        deterministic fault fixtures and frozen split metadata
test/              deterministic, adversarial, recovery, and terminal UX tests
```

## Documentation

- [CLI user guide](docs/user-guide.md)
- [Architecture](ARCHITECTURE.md)
- [Security and trust boundary](SECURITY.md)
- [Reproducibility](REPRODUCIBILITY.md)
- [Claims and non-goals](CLAIMS.md)
- [Exact-SHA prior-art ledger](docs/research/source-ledger.md)
- [Codex CLI and Gajae-Code UX code-path study](docs/research/cli-ux-reference.md)
- [Evaluation plan and current evidence](docs/evaluation/final-report.md)
- [Limitations](LIMITATIONS.md) and [negative results](NEGATIVE_RESULTS.md)

## Claim discipline

The current repository supports an architecture and deterministic systems-artifact claim. It does not claim that one improved score, a retry, a prompt rewrite, or an unsealed development run demonstrates general self-improvement. The proposed attribution-guided bounded mutation must still beat static, retry, sampling, reflection, prompt-only, and free-form rewrite baselines under matched budgets on sealed held-out work.

### Permanent public-development boundary

Every artifact in this public development snapshot—and every copy, alias, dependency, wrapper, or
provenance-derived descendant—remains `publicDevelopment=true` and
`authorizedForResearchEvidence=false`. Renaming it, changing the protocol ID, rewriting Git history,
or deleting the repository cannot make it sealed, held-out, confirmatory, or promotable evidence.
