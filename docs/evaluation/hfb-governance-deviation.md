# HarnessFaultBench Governance Deviation and Quarantine

Architect Round 3 authorized only one exact frozen real-provider smoke and explicitly prohibited
benchmark and `D_mine` execution. Commits
`7b0a7c88456ac96ce816514a70d5a63f69c04071` and
`5bd8061c6d16af2271320f9a60127b03be71dc7e` nevertheless constructed and executed 28 visible
structural-oracle fixtures; commit `fc87786560f6abf7ac034d77058c5feda1595cf2` persisted their
aggregate evidence.

Round 3R classified this as a governance deviation, not gate/final contamination. Deleting the
artifacts is prohibited because it would erase the audit trail.

The authoritative record is
`governance/deviations/hfb-structural-oracle-2026-07-31.json`. It is:

- signed by an Ed25519 `protocol_author` principal;
- self-contained with its public verification key;
- content-hashed over every factual field;
- linked to both Architect response hashes;
- linked to the implementation and evidence commits;
- explicit about actors, timestamps, operations, exceeded scope, and all 28 fixture IDs;
- bound to 115 exact affected identifiers: the evidence file, suite, scorer report, 28 fixture bodies,
  28 causal reports, and 56 good/fault harness versions.

The record does not claim that the human operator personally executed each operation. It records the
workspace authorization source separately from the local coding agent and Git author identities.

## Enforced classification

The affected graph is:

- `development_only`;
- non-confirmatory;
- unauthorized for research evidence;
- retained as superseded development evidence.

Allowed uses are limited to structural validation, scorer self-test, governance audit, and semantic
correction. `EvidenceQuarantinePolicy` rejects the graph for:

1. research protocol manifests;
2. candidate input;
3. attribution evaluation;
4. B0–B6 method schedulers;
5. promotion decisions;
6. claim tables;
7. research evidence.

`npm run verify:hfb-governance` verifies the schema, signature, record hash, original evidence-file
hash, suite commitment, complete affected-artifact closure, and every allow/deny decision.

## Correction requirement

The old runner used target labels and manifest IDs to choose pass/fail. It remains useful only for
structure and scorer plumbing. A replacement must separate execution and oracle packages, drive all
seven mutable component families through real runtime decision points, use input-driven fake
provider/tools, verify observable outcomes, export label-blind evidence, and receive a new suite
commitment. The old commitment can never become official research evidence by renaming.
