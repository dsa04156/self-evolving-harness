# HarnessFaultBench-v0

Status: `D_mine` has 28 quarantined structural-oracle plumbing cases; semantic implementation pending;
`D_gate` and final bodies absent
Purpose: eventual measurement of harness-defect attribution, not general LLM coding ability.

## Design

Seven MVP-mutable component families each receive eight deterministic single-fault cases:

1. `SystemPrompt`
2. `ContextPolicy`
3. `MemoryRetrievalPolicy`
4. `Skill`
5. `WorkflowPolicy`
6. `RoutingPolicy/SubagentPrompt`
7. `ToolDescription`

Per family:

- cases `01`–`04`: `D_mine`;
- cases `05`–`06`: `D_gate`;
- cases `07`–`08`: final role; sealed only under the independent vault conditions below.

Fourteen additional final-only tasks contain two interacting component defects. They are called sealed
only if the independent authorship/vault conditions in `FIXTURE_SPEC.md` are met. Total:

- 56 single-fault cases;
- 14 multi-cause cases;
- 70 cases overall.

## Fixture contract

The authoritative construction contract is [FIXTURE_SPEC.md](FIXTURE_SPEC.md). It freezes the exact
01–08 fault mechanisms, difficulty bands, causal intervention oracle, 14-pair multi-cause graph,
deterministic scorer, ambiguity rejection, and independent review before any fixture is implemented.

Each existing structural-oracle `D_mine` case contains:

- a known-good component bundle;
- one deterministic injected mutation per declared fault;
- a fake-provider script and fake-tool environment;
- expected runtime events and verifier outcome;
- visible development ground-truth component IDs;
- a label oracle restricted in code to scorer self-tests on `D_mine`;
- a superseded development commitment prohibited from experiments.

`D_gate` and final fixture bodies and labels have not been instantiated. Their IDs and construction
contract remain public, but their future bodies require the separate benchmark-author/evaluator-vault
workflow. The public multi-cause file is graph metadata, not executable task data.

The current structural implementation creates content-addressed good/faulty whole-harness manifests
whose only changing binding is the declared mutable component. Its runner reads ground truth and
manifest identities; payload semantics do not cause the outcome. Permission, safety, budget, model
identity, runtime contract, tool implementation, and capability set remain pinned.

Single-fault tasks measure top-1 and top-3 component attribution. Multi-cause tasks measure recall@2 and
exact-set@2 and must not be coerced into a single-cause label.

## Leakage boundary

The future benchmark vault is an immutable protocol artifact and is never mounted into proposer
workspaces. `D_gate` and final fixture bodies, ground truth, and task-level results are evaluator-only.
The checked-in split manifest freezes opaque IDs; it does not authorize proposer access or body
construction through the public builder.

Multi-cause and final single-fault results cannot create, select, promote, tune, repair, or roll back a
candidate.

## Quarantined structural/scorer self-test

Run:

```bash
npm run validate:hfb-structural-oracle
```

The command refuses a dirty Git worktree, binds evidence to the actual `HEAD`, rebuilds all 28
structural cases, and emits the superseded suite commitment plus oracle-plumbing validation.
Persisted evidence is in
`architect/evidence/harness-fault-bench-mine/evidence.json`.

The scorer's 28/28 output in that artifact is produced by a function explicitly given the visible mine
labels. It proves only scorer plumbing and is not attribution accuracy, model performance, or
self-improvement evidence.

The signed record at
`governance/deviations/hfb-structural-oracle-2026-07-31.json` covers all 115 affected artifact
identifiers and mechanically blocks research, candidate, scheduler, promotion, and claim use. Run
`npm run verify:hfb-governance` to verify it.

## Remaining pre-experiment validation

- exactly 28 mine, 14 gate, 14 sealed single-fault, and 14 sealed multi-cause IDs;
- no ID overlap;
- every mutable component has 4/2/2 single-fault distribution;
- every replacement fixture diverges through runtime-observable behavior before verification;
- no replacement executor, provider, tool, trace, verifier, or attribution adapter can access labels;
- identical seed/input produces identical event-chain hash;
- all causal interventions and three deterministic replays pass;
- independent author/reviewer access rules pass for newly authored gate/final bodies;
- future gate/final content commitments are verified by the external evaluator.
