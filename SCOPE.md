# Scope: Standalone Self-Evolving Coding-Agent Harness

Status: **pre-implementation Gate 1RR research contract**
Protocol version: `draft-1`
Date frozen: 2026-07-30

## System boundary

This project will build a standalone coding-agent harness that directly owns:

- a model-provider interface and one provider implementation;
- context construction and an agent execution loop;
- a tool registry and read, write, edit, bash, and git tools;
- filesystem memory, skill loading, workflow/routing, subagents, and background jobs;
- session lifecycle, permissions, sandbox integration points, events, evidence, verification,
  recovery, and exact replay;
- a versioned harness component graph and a separate harness evolution lifecycle.

Codex, Gajae-Code, OpenCode, and their plugins are prior art and experimental baselines. They
are not execution backends for the new runtime. The product is not a wrapper, plugin, or external
controller for any of them.

## Two first-class loops

### Inner loop: Task Execution Loop

```text
context → model → tool call → tool result → verification → completion or task-local retry
```

The inner loop operates under one immutable `HarnessVersion`. A retry, recovery, reflection,
prompt reinjection, or memory write does not change that version.

### Outer loop: Harness Evolution Loop

```text
multiple traces
→ weakness mining
→ failure attribution
→ bounded component mutation
→ new candidate HarnessVersion
→ static validation
→ mine evidence and one non-adaptive gate evaluation
→ approve or reject qualification
→ separately deploy or roll back the production pointer
```

The outer loop produces a new content-addressed `HarnessVersion` before candidate evaluation.
It cannot rewrite the production target in place. Approval alone does not deploy anything.

## MVP mutable surface

- `SystemPrompt`
- `ContextPolicy`
- `MemoryRetrievalPolicy`
- `Skill`
- `WorkflowPolicy`
- `RoutingPolicy`
- `SubagentPrompt`
- `ToolDescription`

## MVP immutable surface

- evaluator implementation and promotion policy;
- benchmark tasks, split assignment, fixture contract, and final-role access rules;
- permission and safety policy;
- base-model identity and parameters;
- token, model-call, tool-call, feedback, and wall-time budgets;
- trace collector and tamper-evident append-only audit protocol;
- tool implementations and middleware;
- optimizer/proposer code.

The immutable surface is protocol-scoped by digest and executes outside the candidate's mutation
authority. Distinct OS identities/containers, authenticated messages, mounts, secrets, network and
host-enforced resources are required; language/process separation alone is not a security boundary.

## Evolution minimum definition

An operation may be called harness evolution only when all conditions hold:

1. It creates a new immutable `HarnessVersionManifest`.
2. It records changed components, source evidence, attribution, proposer identity, and provenance in
   external signed records.
3. It evaluates the candidate independently from its parent.
4. It records an approval or rejection; deployment and rollback are separate whole-harness production
   pointer decisions and CAS records in a tamper-evident append-only audit chain.
5. It preserves the parent version and supports content-hash comparison and restoration.

An improved score in a single run is not evidence of general self-improvement.

## Current repository status

The pre-contract Python files are hash-pinned under `spikes/python-contract-spike/` with an explicit
non-authoritative notice. They are outside package, test, import, runtime, and evidence paths. No approved
implementation may import or copy them without a fresh contract mapping after Gate 1 approval.
