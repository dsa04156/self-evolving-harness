# Implementation Inventory

Implementation commit: `5bd8061c6d16af2271320f9a60127b03be71dc7e`

Implementation tree: `8d0113de86a79bb0a95aa48c48817520acf7c55e`

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
| Evolution Control Plane | weakness mining, attribution, bounded mutation, lineage, static admission, signed evolution-run journal, canonical candidate bundle, deterministic Git commit/snapshot, external evaluation, qualification, deployment/rollback primitives | implemented for deterministic orchestration and the bounded local OS-principal model |
| Immutable Trust Plane | principal identities, signed wire protocol, evaluator/promoter/audit separation, budget freeze, OS-boundary adversarial tests | implemented for the bounded local threat model |

## Required deliverables

| Deliverable | Status | Evidence or gap |
|---|---|---|
| Architecture and loop diagrams | implemented | `docs/architecture/`, `docs/diagrams/` |
| Component, event, evidence, lifecycle schemas | implemented | 59 JSON Schemas compile |
| Session and harness state machines | implemented | separate stores and transition tests |
| Threat model | implemented, bounded | no broad containment claim |
| Minimum working runtime | implemented | deterministic CLI demo and runtime-loop tests |
| Fake model/tool deterministic tests | implemented | agent loop, filesystem, shell, git, memory/skill/context paths |
| Real provider adapter | implemented, contract-tested | live provider interoperability deferred under `NP-1` |
| Read/write/edit/bash/git tools | implemented | `src/tools/builtins.ts` |
| Filesystem memory | implemented | `src/runtime/memory.ts` |
| Versioned harness registry | implemented | `src/harness/component-registry.ts` |
| Candidate Git worktree isolation | coordinator-integrated | exact component closure is committed, frozen, materialized read-only, and bound to the evaluator request |
| Bounded mutation | implemented | one/two mutable-component limit, immutable-diff gate, rejected-signature check |
| External evaluator process | coordinator-integrated | authenticated framed protocol, mounted candidate bundle verification, and crash recovery |
| Promote/reject/rollback trail | implemented and coordinator-integrated | qualification and deployment decisions remain separate |
| Matched B0–B6 budget machinery | implemented deterministically | no empirical research task has run |
| Executable HarnessFaultBench fixtures | `D_mine` implemented | 28 content-addressed good/fault harness pairs, finite fake tables, causal interventions, strict scorer; gate/final bodies absent |
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
6. canonical export of the complete candidate component closure and payloads;
7. a deterministic detached Git commit containing only `.seh-candidate-bundle.json`;
8. a descriptor binding base commit, candidate commit, tree, complete path set, Git blobs, modes, and
   bytes;
9. a read-only snapshot mounted into the external Python evaluator, where the bundle ID, harness ID,
   manifest IDs, payload hashes, dependency closure, and request candidate ID are independently checked.
10. deterministic construction of all 28 visible HarnessFaultBench `D_mine` cases;
11. single-component diff, declared-patch, immutable trust-pin, capability, good/fault, restoration, and
    three-replay validation for every mine case;
12. a strict single-fault scorer and a label-fed self-test that is explicitly excluded from performance
    evidence.

Approval, rejection, and evaluator-failure paths pass. The integration exposed and fixed an existing
promotion reason-code bug where gate IDs containing hyphens could not be represented by the frozen
schema.

## Next integration gaps

1. Implement the separate evaluator-vault and independent authorship workflow before creating any
   HarnessFaultBench gate/final body.
2. Add root shipping documentation and reproducibility commands.
3. Preserve the local-only security wording: malicious host root/kernel, distributed deployment, and
   public-provider behavior remain outside this evidence.
