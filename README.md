# Self-Evolving Harness

A standalone coding-agent harness with two independently governed lifecycles: task execution and
harness evolution. The runtime owns provider calls, context, tools, memory, skills, workflow/routing,
subagents, backend jobs, sessions, sandboxing, evidence, verification, recovery, component versions,
candidate evaluation, and deployment history. It does not execute Codex, Gajae-Code, OpenCode, or any
other coding-agent harness as its backend.

## Status

| Scope | Verdict | Meaning |
|---|---|---|
| Deterministic MVP implementation | **PASS** | The managed runtime, six planes, schemas, fake-provider tests, provider adapter, bounded evolution path, external evaluator, worktree isolation, and audit trails are implemented. |
| Architectural claims C-A1–C-A3 | **SUPPORTED within the documented local TCB** | Source, process-boundary, deterministic, and adversarial tests cover the stated implementation boundary. |
| Empirical self-evolution claims C-H1–C-H4 | **REVISE / UNEXECUTED** | No paid-provider rollout, sealed held-out run, or matched B0–B6 experiment has occurred. The repository makes no performance claim. |

The implementation is complete as a deterministic research harness. The preregistered empirical
study remains deliberately unexecuted because no Platform API credential or private evaluator corpus
was supplied. Codex CLI was used to develop this repository and is not a runtime provider.

## Quick start

Requirements are pinned to Node.js 24.18.1 and npm 11.18.0.

```bash
npm ci
npm run cli -- demo
```

The demo runs without a network or API key and exercises the complete managed path:

```text
session start → context → FakeProvider → filesystem tool → verifier
→ signed evidence → completed → retired
```

It writes only under ignored `.seh/` state and reports the workspace, terminal session state, model and
tool usage, event-chain head, and evidence-receipt count.

Run the complete release gate with:

```bash
npm run verify:release
```

That command type-checks, builds, runs every deterministic test, compiles all JSON Schemas, executes the
managed CLI demo, and verifies the development, publication, historical-publication, and aggregate
trust-plane evidence.

## Two first-class loops

```text
Task Execution Loop
context → model → tool call → tool result → verification → complete or bounded retry

Harness Evolution Loop
many traces → weakness mining → component attribution → bounded mutation
→ new content-addressed HarnessVersion → isolated evaluation
→ approve/reject qualification → independent deploy/rollback decision
```

A retry, recovery, reflection, memory write, or prompt reinjection never creates a harness version and
is never reported as evolution.

## Implemented surface

- provider abstraction, deterministic fake provider, canonical request-table provider, and OpenAI
  Responses/Connect adapters;
- append-oriented model/tool/verifier loop and managed operations facade;
- read, write, exact edit, bash, `git status`, and `git diff` tools;
- workspace path guards, no-network bubblewrap process execution, permissions, and hard budgets;
- filesystem memory, declarative skills, closed workflow and routing runtimes;
- signed, schema-validated subagent/backend-job records with inherited pins, reduced permissions,
  hierarchical budget charging, cancellation, orphan recovery, and artifacts;
- separate signed session and harness-qualification lifecycles;
- content-addressed component DAG and harness registry with mutable-class enforcement;
- runtime events, evidence receipts, facts/inferences separation, artifacts, and audit chains;
- weakness attribution, bounded proposals, rejected-edit memory, candidate bundles, Git worktree
  isolation, external evaluator process, qualification decisions, deployment CAS, and rollback;
- deterministic HarnessFaultBench plumbing and matched-budget B0–B6 scheduling contracts.

Qualification ends at `approved`; production activity is represented by a separate signed channel
pointer. Consequently, `active` is a deployment projection and `rolled_back` is a deployment event,
not mutable state embedded in a `HarnessVersion` manifest. This split prevents approval from silently
changing production and preserves exact rollback targets.

## Public-development evidence boundary

Every artifact in the governed public development snapshot and every copy, alias, dependency, wrapper,
or provenance-derived descendant remains `publicDevelopment=true` and
`authorizedForResearchEvidence=false`. Renaming it, changing the protocol ID, rewriting Git history, or
deleting the repository cannot make it sealed, held-out, promotable, or confirmatory evidence.

## Credentials and external actions

No API key, private key PEM, provider token, `.env` file, or live credential is stored in the
repository. Real-provider smoke support is opt-in and fail-closed; deterministic verification needs no
credential. See [SECURITY.md](SECURITY.md).

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Completion matrix](docs/completion/acceptance-matrix.md)
- [Reproducibility](REPRODUCIBILITY.md)
- [Security and threat boundary](SECURITY.md)
- [Research contract and claims](RESEARCH_CONTRACT.md), [CLAIMS.md](CLAIMS.md)
- [Evaluation final report](docs/evaluation/final-report.md)
- [Related work](docs/research/related-work.md)
- [Paper draft](paper/draft.md)
- [Limitations](LIMITATIONS.md) and [negative results](NEGATIVE_RESULTS.md)

Detailed schemas live in `schemas/`, executable code in `src/`, deterministic tests in `test/`, and
external evaluator processes in `evaluator/`.
