# Implementation Inventory

Last audited runtime source commit: `88e39cdebf1df4db7688fff592363f5f867533ce`

Audited runtime source tree: `ccb20381cc3308cb71954789614144575870eb83`

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
| Evolution Control Plane | weakness mining, attribution, bounded mutation, lineage, static admission, signed evolution-run journal, canonical candidate bundle, deterministic Git commit/snapshot, external evaluation, qualification, deployment/rollback primitives, development-only prediction seal and anti-laundering graph | implemented for deterministic orchestration and the bounded local OS-principal model |
| Immutable Trust Plane | principal identities, signed wire protocol, evaluator/promoter/audit separation, budget freeze, five-principal candidate path, eight-principal development-evolution path, OS-boundary adversarial tests | implemented for the bounded local threat model |

## Required deliverables

| Deliverable | Status | Evidence or gap |
|---|---|---|
| Architecture and loop diagrams | implemented | `docs/architecture/`, `docs/diagrams/` |
| Component, event, evidence, lifecycle schemas | implemented | 64 JSON Schemas compile |
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
| HarnessFaultBench structural-oracle plumbing | implemented, superseded and quarantined | 28 content-addressed good/fault harness pairs validate structure and scorer plumbing only; semantic replacement and development-only process run exist; gate/final bodies absent |
| Development attribution process boundary | implemented, pending narrow Architect review | eight subordinate UIDs, prediction-before-label release, only-scorer oracle mount, actual standalone synthetic execution, recursive anti-laundering quarantine, self-verifying evidence bundle |
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
10. deterministic structural-oracle construction of all 28 visible HarnessFaultBench `D_mine` cases;
11. single-component diff, declared-patch, immutable trust-pin, capability, manifest-ID oracle
    intervention, and three-replay validation for every mine case;
12. a strict single-fault scorer and a label-fed self-test that is explicitly excluded from performance
    evidence.

Items 10–12 are superseded development evidence under the signed governance quarantine. They are not
semantic attribution fixtures and cannot be consumed by research or promotion paths.

The follow-up development boundary additionally proves, within the local Linux TCB, that:

13. attribution, prediction commitment, scoring, mutation, quarantine, runtime, evaluation, and audit
    execute under eight distinct subordinate UIDs and role-owned keys;
14. the scorer capability is absent until the complete prediction commitment is durably sealed;
15. only the scorer sees the visible-fixture oracle and no score/oracle artifact returns to the proposer;
16. the synthetic parent and candidate execute through the standalone runtime rather than supplied
    outcome pairs;
17. exact, copied, aliased, wrapped, indirect, alternate-lifecycle, promotion, claim, and post-score
    laundering attempts are denied; and
18. the self-verifying evidence bundle remains development-only, public-fixture, non-promotable, and
    outside C-H1–C-H4.

Approval, rejection, and evaluator-failure paths pass. The integration exposed and fixed an existing
promotion reason-code bug where gate IDs containing hyphens could not be represented by the frozen
schema.

## Next integration gaps

1. Obtain the narrow Architect decision on the local body-free evaluator-vault and independent
   authorship contract.
2. After explicit authorization, add private vault-state crash recovery and exercise the frozen mount
   table under distinct OS identities before any real benchmark body is admitted.
3. Add root shipping documentation and reproducibility commands.
4. Preserve the local-only security wording: malicious host root/kernel, distributed deployment, and
   public-provider behavior remain outside this evidence.
