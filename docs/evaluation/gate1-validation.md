# Gate 1R Local Validation Record

Date: 2026-07-30
Scope: revised research, architecture, trust, and evaluation contracts only
Prior external decision: `REVISE`
External model/provider execution during revision: none
Gate, final-role, temporal-holdout, or withheld-public-test execution: none

## Result

`PASS_FOR_EXTERNAL_REVIEW`: all deterministic Gate 1R document and schema prechecks currently pass.
This result does not constitute Architect approval, runtime evidence, sandbox evidence, benchmark
performance, or a self-improvement claim.

The previous Gate 1 packet remains historical evidence. The revised packet supersedes its contracts only
after it receives an explicit external Gate 1R decision.

## Deterministic contract precheck

Command:

```text
rtk python3 scripts/validate_gate1r_contracts.py
```

Result:

```text
PASS schemas=29 type_registry=valid splits=28/14/14/14+45/10/34 spike=quarantined markdown_links=10
```

The validator checks:

- JSON parsing and Draft 2020-12 meta-schema validity for all 29 schemas;
- resolution of repository-local `$ref` targets and fragments;
- validation of the component-type registry as an instance;
- registry identity, payload-contract hashes, and the exact MVP mutable set;
- HarnessFaultBench and Terminal-Bench split counts and disjointness;
- evaluation-budget and gate-feedback YAML parsing and frozen `K`/feedback limits;
- immutable manifest separation from provenance, lifecycle, evaluation, and deployment state;
- quarantine paths and archived hashes for the pre-contract Python spike;
- existence of all required Gate 1R artifacts; and
- local Markdown link resolution for the Gate 1R contract graph.

## Frozen identities and artifact digests

The component type registry identity is
`ctr-sha256:4ea08a4fc41207afab1c571c43a3ca11bbdda3b9268ff556fccbac3a0d7edada`.
This is the protocol-defined canonical identity; the raw file digests below are transport and audit
evidence.

| Artifact | SHA-256 |
|---|---|
| Component type registry | `53ea8090210c9c0efda05a8637db773d6faf36dbf5d5cb9066b41745efae3780` |
| Component manifest schema | `defdb238b1d3149312241793e467e385cb54a05c0b3612785a6056f23197f9c7` |
| Harness manifest schema | `147a039af5f1fe5214219157df06179cae18726845da5498970272f3c127f6cf` |
| Protocol manifest schema | `b29804ad5e4b96c89f195ba4bc25ebffd31a4647e849ac4d9c1a92f344650d10` |
| Canonicalization contract | `4d391c3a6c042da85bf37d04bc17f4c0fa8528748edb70098fbe1e9b1cf417fe` |
| Split manifest | `fbab1b5bb8c7796cab08ee5c4b3368647edbae4ec99678b408d6e3ff240966fb` |
| Evaluation budget | `d9ea3533ade1778c39d8b9e189f3987d13596ca69cca311d42eeadd4e442dc42` |
| Gate feedback policy | `8b14310349cb98921a15f880ad777062c229566c6ce6e968f3fb47cf8b8441c6` |
| Baseline matrix | `1638b62cdc58c1fe7f8247084c84785971258810e6909a6b32c986a188313544` |
| Phase budget ledger | `e58936dc61585259fe13e29b9cb81e2b9eea2c9b61e964a7d35ce5ea17de9522` |
| Metric/split matrix | `6e94d823f4ced03c690457e79ba4d3af9319e9d6fd180382f40139add54ac0fe` |
| Statistical analysis plan | `7c9db67ff80db2f3d4013d1cbb9a863cea5eda2cbc68b7313216c5896d18022e` |
| HarnessFaultBench fixture specification | `e8f18fe797c2873cbe83d9673ab25cafff4a46aff848fff6cc5e8919e32c6a4a` |
| Principal/capability matrix | `3efd96568d40edc8b8134922f201d3d7a9c9d06118c4ddf3ced26de991d652ed` |
| Runtime/evaluator ADR | `f2ee1ef3937b5df7104b8b376f781146e51c72de19a02b47bd59eff62d39c5e3` |
| Validator/adversarial acceptance plan | `e3f57536a706de7f06018cc7ad7aeaf6a4b1b31f1dd24534cdfeae177b3cec41` |
| Static precheck implementation | `bd0ec56fa7d50d20a4a313de63322732a5794ac57da1324c0794d5c76195212d` |

## Split and terminology checks

| Benchmark | Mine/train | Gate/validation | Final role |
|---|---:|---:|---:|
| HarnessFaultBench single-fault | 28 | 14 | 14 final single-fault |
| HarnessFaultBench multi-cause | 0 | 0 | 14 final multi-cause |
| Terminal-Bench 2.1 replication | 45 | 10 | 34 withheld public test |

Terminal-Bench is not described as sealed in the revised protocol. HarnessFaultBench final data may be
called sealed only if the independent benchmark-author and vault conditions in the data-access contract
are actually satisfied; otherwise it is reported as developer-withheld.

## Diagram validation

Five standalone HTML/SVG diagrams were rendered at 1440×1000 in local Chrome:

- six-layer architecture;
- task-execution sequence;
- harness-evolution sequence;
- session lifecycle; and
- harness-version lifecycle.

All five had zero console errors or warnings, a document scroll width equal to the 1440-pixel viewport,
and no inspected text outside its SVG view box. Screenshots are local development evidence under
`output/playwright/`; they were not used as runtime or security evidence.

## Deliberately untested before Gate 1R approval

- executable cross-field validators and canonicalization golden vectors;
- component DAG, closure hashing, and whole-harness CAS activation;
- provider, context, tool, memory, skill, session, subagent, and operations runtime;
- UID/container/mount/key/network/resource isolation;
- authenticated wire protocol and adversarial transport tests;
- HarnessFaultBench fixture implementation or execution;
- candidate worktree isolation, external evaluator, promotion, rejection, or rollback;
- paid provider smoke tests, pilot calibration, gate feedback, final-role evaluation, or claims.

These are intentionally deferred implementation obligations. An explicit Gate 1R `APPROVE` is required
before the runtime prototype begins.
