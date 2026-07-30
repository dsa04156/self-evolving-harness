# HarnessFaultBench-v0

Status: fixture-construction contract frozen candidate; executable fixtures pending Gate 1 approval
Purpose: measure harness-defect attribution, not general LLM coding ability.

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

Each executable case will contain:

- a known-good component bundle;
- one deterministic injected mutation per declared fault;
- a fake-provider script and fake-tool environment;
- expected runtime events and verifier outcome;
- hidden ground-truth component IDs;
- an attribution oracle used only by the evaluator;
- a content commitment recorded before experiments.

Single-fault tasks measure top-1 and top-3 component attribution. Multi-cause tasks measure recall@2 and
exact-set@2 and must not be coerced into a single-cause label.

## Leakage boundary

The benchmark vault is an immutable protocol artifact and is never mounted into proposer workspaces.
`D_gate` and final fixture bodies, ground truth, and task-level results are evaluator-only. The checked-in
split manifest freezes opaque IDs; it does not authorize proposer access.

Multi-cause and final single-fault results cannot create, select, promote, tune, repair, or roll back a
candidate.

## Required pre-experiment validation

- exactly 28 mine, 14 gate, 14 sealed single-fault, and 14 sealed multi-cause IDs;
- no ID overlap;
- every mutable component has 4/2/2 single-fault distribution;
- every fixture fails under its injected bundle and passes under the known-good bundle;
- identical seed/input produces identical event-chain hash;
- all causal interventions and three deterministic replays pass;
- independent author/reviewer access rules pass;
- the benchmark content commitment is verified by the external evaluator.
