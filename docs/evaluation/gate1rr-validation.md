# Gate 1RR Local Contract Validation

Date: 2026-07-30
Scope: only the corrections authorized by the Gate 1R `REVISE` decision
External provider or benchmark execution: none
Gate/final/temporal/withheld-public access: none

## Result

`PASS_FOR_EXTERNAL_REVIEW`

```text
PASS schemas=33 type_registry=valid splits=28/14/14/14+45/10/34 multicause_graph=14_edges_degree4 lifecycle=qualified_deployed_terminated gate=one_shot h3=B6_vs_B6-RAW spike=quarantined markdown_links=10
```

This is a static design-contract result. It is not runtime, isolation, evaluator, benchmark,
performance, security, or self-improvement evidence.

## Machine-checked conditions

- all 33 JSON Schemas pass Draft 2020-12 meta-schema checks and repository-local `$ref` resolution;
- harness qualification has only the enumerated legal pairs and contains neither `active` nor
  `rolled_back`;
- protocol-v1 deployment has exactly one `production` channel, separate signed deployment decisions,
  initialize/deploy/rollback/decommission operations, exact rollback-target hash and qualification
  references, and initialize/non-initialize pointer-shape constraints;
- the session schema admits only its enumerated normal/recovery pairs and the fail-closed
  `nonterminal → terminating → terminated` path with the complete reason set;
- the protocol manifest directly pins method-arm, candidate-selector, gate-report-template, and
  analysis-program hashes;
- gate access is one-shot, non-replicable under this protocol, has zero adaptive candidate feedback,
  and restricts pre-final recipients to promoter/audit;
- H3 is explicitly `B6` versus `B6-RAW`, representation-only, mine/dedicated-pilot, with five fixed
  candidate slots and no replacement;
- `seh-candidate-cost-v1` contains exact integer cross-product terms and the frozen formula text;
- the 14 multi-cause IDs exactly equal the unchanged split list, contain no duplicate pair, give degree
  four per family overall, and degree two per family in each seven-edge difficulty stratum;
- H4 is exploratory, uses zero second-model evolution calls, and forbids retuning/reselection; and
- the pre-contract spike remains hash-valid and quarantined.

## Replacement artifact hashes

### Lifecycle and deployment

| Artifact | SHA-256 |
|---|---|
| `schemas/harness-lifecycle-record.schema.json` | `17f3bf41adfdbbe725dc59cbd4d401f714565c30ed8f85f2de01d65fbed46641` |
| `schemas/deployment-decision.schema.json` | `e30c8ba71b7194e230da3366061df8c88326ac40985de38fa849d6ec02c7dd0d` |
| `schemas/deployment-pointer-record.schema.json` | `4cc6811eb0e03e6fc9eee7000dd63587fa913106f32cdcfac90185ae07c41068` |
| `schemas/promotion-decision.schema.json` | `609b3cb60d0ef1b8f3df92e0949a80fbb42425f75fd8146aa2f1ba757d8d40f5` |
| `schemas/session-lifecycle-record.schema.json` | `c0abfa411c5605c5f7563b2e930a66ebd498e74c6609487f56127629df012b8a` |
| `schemas/operation-response.schema.json` | `f8a49c8add54d82db05437ea8e7a31c5ce84a75682ca3bcad7b474e4c8ffa211` |
| `docs/architecture/state-machines.md` | `388663df004f101e8588e3eadda56a663a972936e384694986c3799161f8bfb0` |

### Gate, H3, cost, and H4

| Artifact | SHA-256 |
|---|---|
| `schemas/protocol-manifest.schema.json` | `df0cb66c3d98a48482f7a1dc29dd71804f4439d61f8a0d79c796687c56cb3955` |
| `schemas/candidate-cost-gate.schema.json` | `2ea1fb50b522fd9a089e98f21b701626f006b31cce776ff8e789b26ae68adb2c` |
| `configs/gate-feedback-policy.yaml` | `11b6645fd7a659dc920950f7340122f38d3c1f4b87e56d1e26f0d92e96bdcea7` |
| `configs/evaluation-budget.yaml` | `010e508d18e7bca6697841b8ed1c33b8e060f946c6e975eb0a65a353f84d5b4d` |
| `docs/evaluation/baseline-matrix.md` | `2d28bbc7339bc69ed613a09352968e9f3126291ea9311b8bf2414a3698af82a8` |
| `docs/evaluation/data-access-policy.md` | `a39b9ba24131e2fb5945a9c68e1957336ccf8ee550f6470d9280dd53104fd8f1` |
| `docs/evaluation/phase-budget-ledger.md` | `041235930b30d5cd1ce6782d95d088a2b731557ba6c27189607342c021dfaf49` |
| `docs/evaluation/research-hypotheses.md` | `4b12c845ca3f4f6c1f6c3862e1f2279d0bca1479fc03f45214e006f6d308e9b0` |

### Fixture correction

| Artifact | SHA-256 |
|---|---|
| `benchmarks/harness-fault-bench/FIXTURE_SPEC.md` | `fa4ccddac0e91a07c8a6e614b7bd1078f825e71d64e8ceac86981ea7a754d702` |
| `benchmarks/harness-fault-bench/multicause-graph.json` | `00a802e92ed1214d1ae29f81858b894e23fb9cf8cc81f786df7153c84778980c` |
| `schemas/benchmarks/harness-fault-multicause-graph.schema.json` | `3e30c9895102f8821e8a98d3f33e4f9b9c6299690d121559a47c9c0f425fb399` |
| unchanged `benchmarks/splits.json` | `fbab1b5bb8c7796cab08ee5c4b3368647edbae4ec99678b408d6e3ff240966fb` |

The precheck implementation hash is
`3b8e08376492697c684b56f526f3b5d4fd2caf8903ed62f8044ce0727eb9bff9`.

## Diagram regression check

The corrected qualification and session lifecycle HTML files were rendered in a separate local
headless Chrome session at 1440×1000. Both loaded without console errors or warnings and were visually
inspected. They are repository documentation only and are intentionally excluded from the narrow
Architect packet.
