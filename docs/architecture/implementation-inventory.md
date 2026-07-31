# Implementation Inventory

Snapshot commit: `bff832cdd447acd28748e9f347145eab099e9eb9`

Resource profile: `NP-1`

This inventory distinguishes an implemented primitive from an integrated lifecycle. A collection of
callable services is not marked complete when the required end-to-end control path does not exist.

## Required layers

| Layer | Implemented evidence | Status |
|---|---|---|
| Agent Runtime Kernel | provider interface, `FakeProvider`, context, memory, skills, tools, verifier, budget, descendants, standalone agent loop | implemented |
| Harness Component Model | frozen type registry, content-addressed components and harness manifests, dependency/closure validation, bounded diff | implemented |
| Operations Control Plane | signed session definition, lifecycle, start/observe/interrupt/recover/validate/finalize responses, descendant termination | implemented |
| Evidence Plane | epistemic event classes, signed receipts, append-only logs, artifact store, audit chain, Unix audit transport | implemented |
| Evolution Control Plane | weakness mining, attribution, bounded mutation, lineage, static admission, signed evolution-run journal, first-class coordinator, external evaluation, qualification, deployment/rollback primitives | implemented for deterministic orchestration; Git candidate bundle integration remains partial |
| Immutable Trust Plane | principal identities, signed wire protocol, evaluator/promoter/audit separation, budget freeze, OS-boundary adversarial tests | implemented for the bounded local threat model |

## Required deliverables

| Deliverable | Status | Evidence or gap |
|---|---|---|
| Architecture and loop diagrams | implemented | `docs/architecture/`, `docs/diagrams/` |
| Component, event, evidence, lifecycle schemas | implemented | 53 JSON Schemas compile |
| Session and harness state machines | implemented | separate stores and transition tests |
| Threat model | implemented, bounded | no broad containment claim |
| Minimum working runtime | implemented | deterministic CLI demo and runtime-loop tests |
| Fake model/tool deterministic tests | implemented | agent loop, filesystem, shell, git, memory/skill/context paths |
| Real provider adapter | implemented, contract-tested | live provider interoperability deferred under `NP-1` |
| Read/write/edit/bash/git tools | implemented | `src/tools/builtins.ts` |
| Filesystem memory | implemented | `src/runtime/memory.ts` |
| Versioned harness registry | implemented | `src/harness/component-registry.ts` |
| Candidate Git worktree isolation | implemented as a primitive | not yet orchestrated as part of one evolution transaction |
| Bounded mutation | implemented | one/two mutable-component limit, immutable-diff gate, rejected-signature check |
| External evaluator process | implemented | authenticated framed protocol and crash recovery |
| Promote/reject/rollback trail | implemented and coordinator-integrated | qualification and deployment decisions remain separate |
| Matched B0–B6 budget machinery | implemented deterministically | no empirical research task has run |
| Executable HarnessFaultBench fixtures | not implemented | fixture contract and split manifest only |
| Root shipping documentation | partial | root `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, and final research reports remain |

## Completed integration slice

The authoritative `HarnessEvolutionLoop` now composes:

```text
failure traces
→ weakness pattern
→ attribution inference
→ bounded proposal
→ new candidate HarnessVersion
→ static admission
→ independent evaluation
→ approve or reject
```

The slice added:

1. a signed evolution-run journal and legal phase transitions;
2. one coordinator that binds every generated ID and parent/candidate pin across services;
3. final proposal disposition only after independent evaluation and qualification;
4. deterministic approval and rejection tests with a fake task corpus and authenticated external
   evaluator result;
5. failure behavior proving that the parent and deployment pointer remain unchanged.

Approval, rejection, and evaluator-failure paths pass. The integration exposed and fixed an existing
promotion reason-code bug where gate IDs containing hyphens could not be represented by the frozen
schema.

## Next integration gaps

1. Materialize the exact component candidate closure into its detached Git worktree, commit it
   deterministically, freeze the complete filesystem descriptor, and feed that exact read-only snapshot
   to the external evaluator through the coordinator's preparation contract.
2. Implement executable HarnessFaultBench fixtures without opening any research gate/final role.
3. Add root shipping documentation and reproducibility commands after the combined candidate-isolation
   path is verified.
