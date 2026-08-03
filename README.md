<p align="center">
  <img src="assets/hero.svg" alt="Self-Evolving Harness: separate task execution and harness evolution loops above an immutable trust plane" width="100%" />
</p>

<h1 align="center">Self-Evolving Harness</h1>

<p align="center">
  <strong>Execute tasks. Evolve the harness. Keep trust immutable.</strong><br />
  A standalone coding-agent runtime where self-evolution is a governed lifecycle—not a retry strategy.
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="docs/user-guide.md">CLI guide</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#harness-evolution">Evolution</a> ·
  <a href="#verification">Verification</a> ·
  <a href="ARCHITECTURE.md">Full design</a>
</p>

> [!IMPORTANT]
> This is an experimental research harness. The deterministic MVP is implemented and verified inside
> the documented local trust boundary. No paid-provider, sealed held-out, or matched-budget B0–B6
> experiment has been run, so the project makes **no empirical self-improvement claim**.

## What is Self-Evolving Harness?

Self-Evolving Harness is an independent coding-agent runtime that owns its model loop end to end:

```text
provider → context → model → tool execution → verification → session state → evidence
```

It also owns a second, separately governed lifecycle that turns evidence from many executions into a
new, independently evaluated harness candidate:

```text
traces → weakness mining → attribution → bounded mutation → HarnessVersion
       → isolated evaluation → promote, reject, or rollback
```

It is **not** a Codex wrapper, a Gajae-Code plugin, an OpenCode adapter, or an external controller for
another agent runtime. Codex CLI helped develop this repository; it is not an execution backend.

## Why two loops?

Most agent systems can retry a task, reflect on a failure, or rewrite a prompt in place. Those actions
may help the current run, but they do not establish that the harness itself improved.

This project draws a hard boundary:

| Operation | Same session? | New `HarnessVersion`? | Independent evaluation? | Evolution? |
| --- | ---: | ---: | ---: | ---: |
| Retry or reflection | Yes | No | No | No |
| Recovery after interruption | Yes | No | No | No |
| Memory update | Yes | No | No | No |
| Prompt reinjection | Yes | No | No | No |
| Bounded component mutation | No | Yes | Required | Candidate only |
| Qualified, deployed candidate | No | Yes | Required | Yes |

A change counts as harness evolution only when it creates a content-addressed version, records its
lineage and evidence, evaluates it independently from its parent, and appends a promotion, rejection,
or rollback decision.

## Quick start

`seh` launches its own coding-agent runtime. It does not invoke Codex, Gajae-Code, OpenCode, or
another coding-agent harness behind the scenes.

Requirements:

- Linux with `/usr/bin/bwrap` (`bubblewrap`) for workspace process isolation
- Node.js 22 or newer; deterministic release verification is pinned to Node.js 24.18.1 and npm 11.18.0
- One supported model provider configured as described in the [CLI user guide](docs/user-guide.md)

```bash
git clone https://github.com/dsa04156/self-evolving-harness.git
cd self-evolving-harness
npm ci
npm run link:cli
```

Run the interactive agent in any repository:

```bash
cd /path/to/your/project
seh init --verify "npm test"
seh doctor
seh

# seh:1 > Add input validation and tests for the signup handler
# seh:1 > Now add the regression case we discussed
# seh:1 > /diff
# seh:1 > /exit
```

Every prompt creates a durable, auditable child session while a bounded recent transcript preserves
normal conversational follow-ups. This thread context is not a retry and does not create a new
`HarnessVersion`. Start the shell with an initial prompt, or run a one-shot task with the explicit
non-interactive command:

```bash
seh "Add input validation and focused tests"
seh run "Add input validation and focused tests"
seh exec --read-only "Review this repository"
```

`seh run` can initialize a project automatically, but explicit `init` is recommended because it
makes the model, permission mode, and verification command visible first. The default mode may edit
the selected workspace.

Useful commands:

```bash
seh                                           # interactive coding-agent shell
seh chat                                      # explicit interactive form
seh continue "keep going from the latest session"
seh sessions                                  # recent durable sessions
seh status                                    # latest session evidence and usage
seh resume                                    # interactive session picker
seh resume --last                             # continue the latest session
seh resume SESSION_ID "finish the failed test"
seh memory add -n project_facts "Use npm test"
seh config
```

Project configuration, session evidence, and memory are stored outside the target repository under
`~/.local/state/self-evolving-harness/`. No provider secret is written there. See the
[CLI user guide](docs/user-guide.md) for permissions, OpenAI opt-in, verification behavior, state
layout, and troubleshooting.

For a deterministic runtime check that needs no live model provider, run:

```bash
seh demo
```

## Core capabilities

| Capability | What the runtime owns |
| --- | --- |
| Model providers | Native provider adapters, deterministic fake provider, and canonical request contracts |
| Agent execution | Append-oriented model/tool/verifier loop with hard model, token, tool, retry, descendant, and time budgets |
| Context | Ordered prompt, task, memory, skill, tool, and history selection with explicit overflow behavior |
| Tools | `read`, `write`, exact `edit`, `bash`, `git status`, and `git diff` behind path and permission guards |
| Memory and skills | Filesystem-persistent memory plus declarative, tool-bounded skills |
| Workflow | Closed workflow/routing policies, subagents, and backend jobs with inherited pins and reduced authority |
| Operations | Start, submit, observe, interrupt, resume, recover, validate, finalize, retire, events, and artifacts |
| Evidence | Runtime events, signed receipts, artifacts, fact/inference separation, and append-only audit chains |
| Evolution | Weakness attribution, bounded proposals, rejected-edit memory, worktree-isolated candidates, and external evaluation |
| Deployment | Signed qualification decisions, compare-and-swap channel deployment, rejection history, and exact rollback |

## Architecture

The system is divided into six ownership planes. The upper five may execute or propose changes; the
sixth fixes the rules under which those changes can be trusted.

| Plane | Responsibility |
| --- | --- |
| **1. Agent Runtime Kernel** | Providers, context, agent loop, tools, sessions, memory, skills, descendants, event bus |
| **2. Harness Component Plane** | Versioned component graph, dependencies, provenance, semantic versions, content identity |
| **3. Operations Control Plane** | Lifecycle commands, deterministic transitions, checkpoints, recovery, next allowed actions |
| **4. Evidence Plane** | Events, receipts, artifacts, verification outcomes, facts/inferences, audit chains |
| **5. Evolution Control Plane** | Mining, attribution, bounded mutation, candidate isolation, evaluation, decisions |
| **6. Immutable Trust Plane** | Evaluator, data splits, budgets, permissions, safety, model identity, audit, promotion policy |

Every operations response uses the same control-plane envelope:

```json
{
  "state": "running",
  "evidence": [],
  "nextAllowedActions": ["observe", "interrupt", "validate"]
}
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the contracts and
[the rendered architecture set](docs/diagrams/README.md) for the system, sequence, and state-machine
diagrams.

## Harness evolution

### Versioned component graph

A harness is not one mutable prompt blob. It is an immutable manifest over a dependency graph of
behavior-bearing components:

- `SystemPrompt`
- `ToolDescription`
- `ToolImplementation`
- `ContextPolicy`
- `MemoryRetrievalPolicy`
- `Skill`
- `WorkflowPolicy`
- `RoutingPolicy`
- `SubagentPrompt`
- `RecoveryPolicy`
- `VerificationPolicy`
- `PermissionPolicy`

The immutable manifest records component identity, type, semantic version, content hash, dependencies,
and mutability class. Provenance and evaluation history are append-only external records; the active
version is a signed deployment projection rather than mutable component content.

### Bounded MVP mutation surface

| Mutable in the MVP | Immutable in the MVP |
| --- | --- |
| System prompts | Evaluator and scorer |
| Context selection policy | Benchmark data and splits |
| Memory retrieval policy | Permission and safety policy |
| Skills | Model identity |
| Workflow and routing policy | Token, tool, retry, and time budgets |
| Tool descriptions | Tool implementations and middleware |
| Subagent prompts | Trace collector, audit log, promotion policy, optimizer code |

The mutation proposer cannot grant itself evaluator, data, budget, permission, promotion, or audit
authority. Candidates run in isolated Git worktrees and immutable-file diffs fail closed.

### Separate lifecycle machines

```text
Session
created → initialized → running → waiting / blocked
blocked → recovering → running
running → validating → completed → retired

Harness qualification
draft → candidate → statically_validated → evaluating → canary → approved → retired
  └──────────────────────────────→ rejected ←──────────────────────┘

Deployment projection
no pointer → active A → deploy B → rollback to A → decommission
```

Qualification never silently changes production. `active` is a signed deployment pointer;
`rolled_back` is a signed deployment event with exact before/after hashes. Existing sessions remain
pinned to the version with which they started.

## Evidence and trust

Observed facts and model-generated explanations are different record types. Any inference must point
back to source events and include confidence, producer identity, and alternative explanations.

```text
raw runtime events
  → per-task evidence receipts
  → cross-task failure patterns
  → attribution result
  → mutation evidence packet
  → candidate evaluation
  → signed decision and deployment journal
```

The trust model assumes the local host kernel and repository-controlled protocol authority are in the
trusted computing base. It does not claim containment against host root or kernel compromise, and the
public deterministic evidence is not an external security certification. See
[SECURITY.md](SECURITY.md) for the threat matrix and explicit non-claims.

### Permanent public-development boundary

Every artifact in this public development snapshot—and every copy, alias, dependency, wrapper, or
provenance-derived descendant—remains `publicDevelopment=true` and
`authorizedForResearchEvidence=false`. Renaming it, changing the protocol ID, rewriting Git history,
or deleting the repository cannot make it sealed, held-out, confirmatory, or promotable evidence.

## Verification

Run the complete deterministic release gate:

```bash
npm run verify:release
```

It performs all of the following:

1. Type-checks and builds the TypeScript runtime.
2. Runs the deterministic test suite.
3. Compiles every frozen JSON Schema.
4. Executes the managed no-key CLI demo.
5. Verifies development-process separation and signed evidence.
6. Replays publication and historical-publication governance.
7. Verifies the aggregate immutable trust-plane conformance record.

For the exact reproducibility boundary and subordinate verifier commands, read
[REPRODUCIBILITY.md](REPRODUCIBILITY.md).

## Project status

| Scope | Verdict | What it means |
| --- | --- | --- |
| Deterministic standalone MVP | **PASS** | The runtime, six planes, schemas, fake-provider tests, worktree isolation, evaluator boundary, and audit paths are implemented. |
| Architecture claims C-A1–C-A3 | **SUPPORTED in the local TCB** | Source, process-boundary, deterministic, and adversarial tests cover the documented implementation boundary. |
| Empirical hypotheses C-H1–C-H4 | **NOT RUN / REVISE** | No sealed held-out evaluation or real-provider B0–B6 comparison has occurred. |

The next research milestone is not “more retries.” It is a preregistered, matched-budget comparison of:

- B0 static harness
- B1 parallel sampling
- B2 sequential reflection
- B3 task-specific harness scaling
- B4 prompt-only optimization
- B5 free-form whole-harness rewrite
- B6 attribution-guided bounded mutation

Mine/gate/test access is separated, and the final frozen harness must be evaluated on tasks that were
not available to the proposer. Until that experiment exists, this repository supports an architecture
and systems artifact claim only.

## Credentials and real providers

Deterministic development and release verification require no credential. The repository contains no
API key, provider token, private-key PEM, or committed `.env` file.

Provider credentials, when a selected adapter needs them, are read only from the process environment;
the config, session store, events, and memory never persist them. Real-provider output is
nondeterministic and is not part of the deterministic release gate. Running a coding task does not
by itself establish harness evolution.

## Repository map

```text
src/runtime/       agent kernel, context, tools, memory, skills, workflow
src/product/       user CLI configuration, sessions, defaults, and coding-agent assembly
src/harness/       component graph and version registry
src/operations/    session lifecycle and control-plane operations
src/evidence/      runtime events, receipts, and audit records
src/evolution/     attribution, proposals, candidates, evaluation, promotion
src/trust/         immutable boundary and evaluator-vault contracts
src/governance/    publication and research-evidence governance
schemas/           cross-process JSON contracts
evaluator/         separately launched evaluator and role gates
benchmarks/        deterministic fault fixtures and frozen split metadata
test/              deterministic, adversarial, boundary, and recovery tests
docs/              architecture, research ledger, evaluation protocol, evidence
governance/        signed manifests, journals, and outstanding obligations
```

## Documentation

- [CLI user guide](docs/user-guide.md)
- [Architecture](ARCHITECTURE.md)
- [Deterministic completion matrix](docs/completion/acceptance-matrix.md)
- [Research contract](RESEARCH_CONTRACT.md) and [claims](CLAIMS.md)
- [Evaluation protocol and final report](docs/evaluation/final-report.md)
- [Exact-SHA prior-art ledger](docs/research/source-ledger.md)
- [Codex/Gajae CLI code-path reference](docs/research/cli-ux-reference.md)
- [Execution-path research](docs/research/execution-paths.md)
- [Related work and positioning](docs/research/related-work.md)
- [Reproducibility](REPRODUCIBILITY.md)
- [Security](SECURITY.md)
- [Limitations](LIMITATIONS.md) and [negative results](NEGATIVE_RESULTS.md)
- [Paper draft](paper/draft.md)

## Prior art and claim discipline

The design was informed by code-path-level study of Gajae-Code, OpenAI Codex, Oh My OpenAgent,
OxyGent, Agentic Harness Engineering, Self-Harness, Meta-Harness, the Darwin Gödel Machine, and
TencentDB Agent Memory. Their mechanisms are treated as prior art, not relabeled as novelty.

No single mechanism here is claimed as new. The research question is whether the enforced composition
of a standalone runtime, typed component graph, fact-separated evidence, bounded mutation, isolated
evaluation, and immutable authorities can improve a frozen harness under fair budgets without raising
pass-to-fail regressions. The project will accept a negative answer.
