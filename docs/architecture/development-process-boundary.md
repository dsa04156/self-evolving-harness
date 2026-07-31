# Development Evolution Process Boundary

## Purpose and non-claim

This track implements the narrow process-isolation follow-up authorized by Architect Round 03RRR. It
tests whether the development attribution and bounded-mutation plumbing enforces prediction-before-label
and non-promotability across real OS principals.

It does not evaluate a research hypothesis. The fixtures are public, the provider is deterministic and
fake, and the candidate is permanently tainted as development-only. No result in this track may be used
for qualification, research selection, promotion, canary, deployment, a production pointer, or a
performance/generalization/security/self-improvement claim.

## Role and authority matrix

| Role | UID | Reads | Writes | Never receives |
|---|---:|---|---|---|
| attributor | 1201 | label-blind corpus, own public/private key, pinned code/schema | prototype, complete predictions, signed receipt | oracle, score, candidate result |
| prediction committer | 1202 | corpus, prototype, predictions, own key | commitment, durable prediction seal, signed receipts | oracle, score, mutation |
| scorer | 1203 | oracle, sealed inputs, expected peer/key bindings | oracle-access record, score report, signed receipt | proposal destination, promotion authority |
| mutation proposer | 1204 | sealed predictions, synthetic parent registry, own key | bounded proposal and candidate | oracle, score report, research/promotion registry |
| candidate quarantine | 1205 | candidate registry view, proposal, taint inputs | non-promotable and taint records | oracle, runtime/evaluator keys, promotion authority |
| runtime | 1206 | read-only parent/candidate view, synthetic task requests | signed execution artifacts | oracle, score, evaluator key |
| candidate evaluator | 1207 | signed runtime artifacts, read-only candidate view | signed synthetic evaluation | oracle, proposer output, promotion authority |
| audit | 1208 | all public keys, receipts, hashes, taint closure | final audit receipt and evidence summary | mutation, qualification, deployment authority |

Every process runs in a rootless namespace with a distinct subordinate UID/GID, role-owned mode-0600
key, role-specific read-only mounts, a private writable output mount, no network namespace, zero
effective capabilities, and `NoNewPrivs`. The host root, kernel, RootlessKit, bubblewrap, filesystem
durability, bootstrapping code, and protocol-author inputs remain trusted.

## Sequence

```mermaid
sequenceDiagram
    participant A as Attributor UID 1201
    participant C as Committer UID 1202
    participant U as Audit UID 1208
    participant S as Scorer UID 1203
    participant P as Proposer UID 1204
    participant Q as Quarantine UID 1205
    participant R as Runtime UID 1206
    participant E as Evaluator UID 1207

    Note over A,S: scorer socket and release capability do not exist
    A->>C: signed complete predictions + corpus/prototype hashes
    C->>C: verify and sign commitment
    C->>U: exclusive-create seal; fsync(file); fsync(directory)
    U->>U: verify signer, completeness, bindings, chronology
    U-->>S: create one authenticated scorer socket capability
    S->>S: mount visible oracle and verify SO_PEERCRED, key, nonce, seal
    S->>U: signed diagnostic score
    Note over S,P: no score or oracle edge exists
    C->>P: sealed predictions only
    P->>Q: one bounded development candidate
    Q->>Q: register non-promotable + recursive taint
    Q-->>R: read-only parent/candidate registry view
    R->>E: signed standalone-runtime artifacts
    E->>U: signed synthetic evaluation
    U->>U: verify receipts, closures, taint, and claim boundary
```

## Prediction-before-label invariant

The release predicate is:

```text
scorer_capability_exists
iff
  durable_prediction_seal
  ∧ valid_audit_signature
  ∧ complete_occurrence_accounting
  ∧ exact(corpus, prototype, predictions, commitment, seal)
```

The seal is written with `O_EXCL` and `O_NOFOLLOW`, followed by file and directory synchronization.
The scorer checks the expected committer peer UID with `SO_PEERCRED`, verifies Ed25519 authority, rejects
stale/replayed nonces, and binds every input hash. The evidence run rejects seven attacks: wrong peer,
wrong key, commitment substitution, prediction substitution, corpus substitution, seal substitution,
and replay.

## Actual synthetic execution

The candidate changes one declarative `WorkflowPolicy` action from `construct_context` to `model_turn`.
The runtime principal executes both parent and candidate through the project’s standalone context,
model, tool, verification, and completion loop. A request-observing `FakeProvider`, immutable tool
registry, fixed synthetic tasks, and signed verifier outputs make the run deterministic.

The evaluator principal receives execution artifacts rather than precomputed pass/fail pairs. It checks
candidate/parent identities, task and artifact completeness, signatures, and verifier outcomes before
forming the aggregate. The observed two-task counts are diagnostic plumbing output only and explicitly
set `researchMetric=false` and `promotionSignal=false`.

## Recursive anti-laundering invariant

Development taint follows both identity and dependency edges. A destination is denied when an input
graph contains:

- the exact candidate or artifact hash;
- byte-identical copied component/manifest content;
- an alias or alternate lifecycle identity;
- a wrapper or indirect reference;
- the candidate mutation or evaluator result inside a research record;
- promotion, canary, deployment, production-pointer, or claim use;
- scorer/oracle output imported into a later proposer input.

The operations principal also records the candidate in an append-only non-promotable registry before
runtime execution. Candidate runtime and evaluator principals mount only a separate read-only registry
view, so qualification authority is not co-located with either process.

## Evidence and replay

The evidence bundle is:

```text
architect/evidence/development-process-boundary/os-boundary.json
```

The manifest pins source commit/tree, evidence and implementation hashes, environment versions, command
set, full-suite result, process counts, and claim boundary. Verification is independent of the
generator:

```bash
npm run verify:development-process-boundary
```

The verifier validates the closed JSON Schema, all public-key signatures, role probes, prediction seal,
adversarial rejections, candidate registry and component closures, bounded mutation, runtime and
evaluation artifacts, recursive taint graph, all per-role receipts, final audit receipt, and the
development-only claim boundary.

## Residual risk

This evidence does not defend against malicious host root, a compromised kernel, a dishonest bootstrap
administrator, filesystem hardware loss, or semantic reimplementation that evades all known
identity/content/dependency links. Public-fixture exposure also means a human can adapt a later
development prototype after reading diagnostics. Such a run must record that exposure and remains
ineligible for confirmatory research.
