# HarnessFaultBench D_mine Development Validation

Status: deterministic benchmark-plumbing evidence; no attribution-performance result

Resource profile: `NP-1`

## Exact source and commitment

- implementation source commit: `5bd8061c6d16af2271320f9a60127b03be71dc7e`
- source tree: `8d0113de86a79bb0a95aa48c48817520acf7c55e`
- fixture specification: `hfb-fixture-spec-1.0.1`
- mine suite commitment:
  `sha256:a48496598ee5ebef2ca4678e25c59d5a7666fc25e2ee16317ad933f715364b41`
- persisted evidence: `architect/evidence/harness-fault-bench-mine/evidence.json`

## What was executed

The public builder generated the 28 preregistered `D_mine` single-fault cases: four cases for each of
the seven combined component families. The routing/subagent stratum resolves to two exact
`RoutingPolicy` and two exact `SubagentPrompt` cases.

For every case, the validator checked:

1. both whole-harness manifests and every payload against the frozen schemas;
2. exactly one enabled mutable component binding changed;
3. the declared one-operation patch exactly reproduced the faulty payload;
4. immutable permission, safety, budget, model identity, runtime contract, and tool implementation
   remained pinned;
5. the changed component's capability set remained identical;
6. the known-good harness passed and the faulty harness failed;
7. restoring the ground-truth component passed;
8. changing a non-ground-truth mutable component while retaining the fault still failed;
9. three faulty replays produced identical event-chain hashes.

Observed counts were 28/28 for every required predicate.

## Scorer self-test boundary

The strict scorer rejects missing tasks, duplicate rankings, unknown component IDs, modified fixture
hashes, and mixed roles. A helper given the visible `D_mine` labels produces a 28/28 top-1/top-3
self-test. That number is deliberately stored with:

```json
{
  "oracleWasGivenGroundTruthLabels": true,
  "attributionPerformanceClaim": false
}
```

It does not measure the attribution service, an LLM, a candidate harness, or self-evolution.

## Data boundary

- `D_mine`: executable and visible development fixtures;
- `D_gate`: IDs and contract only; bodies and labels not instantiated;
- final single-fault: IDs and contract only; bodies and labels not instantiated;
- final multi-cause: public graph metadata only; executable bodies not instantiated.

The public builder rejects every non-mine ID even when called with an evaluator role. A future
evaluator-vault implementation must use a separate API and independent benchmark-author principals.

## Reproduction

From a clean Git worktree at the source commit:

```bash
npm run validate:hfb-mine
```

The command derives `sourceCommit` from the actual clean `HEAD`; callers cannot supply it. The test
suite independently regenerates all fixtures and deep-compares both the suite commitment and scorer
report with the persisted evidence.
