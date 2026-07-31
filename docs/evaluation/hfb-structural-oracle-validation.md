# HarnessFaultBench Structural-Oracle Plumbing Validation

Status: superseded deterministic plumbing evidence; development-only, non-confirmatory, and
unauthorized for research evidence

Resource profile: `NP-1`

## Governance disposition

Architect Round 3R determined that constructing and executing these 28 visible `D_mine` bodies exceeded
the previously authorized scope. The artifacts are preserved for audit rather than deleted.

- signed deviation:
  `governance/deviations/hfb-structural-oracle-2026-07-31.json`
- deviation record hash:
  `sha256:c750a9bb2e00c2e5d15d73fab039d950c3df0e910274c006647b2ae9cc798e00`
- classification: `development_only`
- confirmatory use: false
- authorized for research evidence: false

The quarantine rejects this artifact graph as a research protocol pin, candidate input, attribution
evaluation input, B0–B6 scheduler input, promotion input, claim-table input, or research evidence.

## Preserved source and commitment

- implementation source commit: `5bd8061c6d16af2271320f9a60127b03be71dc7e`
- source tree: `8d0113de86a79bb0a95aa48c48817520acf7c55e`
- fixture specification: `hfb-fixture-spec-1.0.1`
- superseded structural-oracle suite commitment:
  `sha256:a48496598ee5ebef2ca4678e25c59d5a7666fc25e2ee16317ad933f715364b41`
- persisted evidence: `architect/evidence/harness-fault-bench-mine/evidence.json`

## What the old runner actually checked

The old `HarnessFaultBenchStructuralOracleBuilder` generated 28 public development cases. Its runner
read the ground-truth component ID plus known-good/faulty harness IDs and selected pass/fail from those
identities. Component payload semantics did not cause the terminal result.

It did validate these structural properties:

1. both whole-harness manifests and every payload against the frozen schemas;
2. exactly one enabled mutable component binding changed;
3. the declared one-operation patch exactly reproduced the faulty payload;
4. immutable permission, safety, budget, model identity, runtime contract, and tool implementation
   remained pinned;
5. the changed component's capability set remained identical;
6. the manifest-ID oracle selected pass for the known-good identity and fail for the faulty identity;
7. restoring the labeled target selected pass;
8. retaining the labeled target fault while changing a non-target selected fail;
9. three faulty replays produced identical event-chain hashes.

Those 28/28 counts prove structural/oracle plumbing only. They do not prove runtime semantic fidelity,
causal attribution evidence, task difficulty, or attribution accuracy.

## Scorer self-test boundary

The strict scorer rejects missing tasks, duplicate rankings, unknown component IDs, modified fixture
hashes, and mixed roles. A helper given the visible `D_mine` labels produces a 28/28 top-1/top-3
self-test. That number remains stored with:

```json
{
  "oracleWasGivenGroundTruthLabels": true,
  "attributionPerformanceClaim": false
}
```

It does not measure the attribution service, an LLM, a candidate harness, or self-evolution.

## Preserved data boundary

- `D_mine`: visible structural-oracle development fixtures;
- `D_gate`: IDs and contract only; bodies and labels not instantiated;
- final single-fault: IDs and contract only; bodies and labels not instantiated;
- final multi-cause: public graph metadata only; bodies not instantiated.

The public builder rejects every non-mine ID even when called with an evaluator role. A future
evaluator vault must use a separate API and independent benchmark-author principals.

## Structural self-test reproduction

From a clean Git worktree:

```bash
npm run validate:hfb-structural-oracle
npm run verify:hfb-governance
```

The first command is explicitly a structural/scorer self-test. It cannot emit official research
evidence. The second verifies the signed quarantine and complete affected-artifact closure.
