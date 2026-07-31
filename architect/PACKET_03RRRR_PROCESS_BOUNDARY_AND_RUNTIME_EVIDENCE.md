# Architect Packet 03RRRR — Development process boundary and measured synthetic runtime evidence

## Requested decision

Return exactly one decision: `APPROVE`, `REVISE`, or `BLOCK`.

Review only whether the development-only follow-up authorized by Round 03RRR is complete:

1. attribution, prediction commitment, scoring, mutation, quarantine, runtime, evaluation, and audit
   execute under distinct OS principals with role-specific keys and mounts;
2. the score/oracle capability is unavailable before a durable prediction seal;
3. scorer release rejects wrong authority, substitution, and replay;
4. the proposer cannot consume post-score oracle/score artifacts;
5. parent and candidate outcomes come from actual standalone-runtime execution rather than supplied
   pass/fail pairs;
6. the candidate and all derived evidence remain recursively tainted and non-promotable; and
7. a separate verifier can reconstruct the evidence graph.

An `APPROVE` decision would close this narrow development process-boundary scope only. It would not
complete Gate 3, authorize a provider call, validate an attribution metric, unlock B0–B6, permit
research/pilot/held-out execution, promote a candidate, or support a performance, security,
generalization, or self-improvement claim.

## Scope and disclosure

Performed:

- used the existing rootless OS-principal machinery to create eight subordinate UID/GID roles;
- gave every role a distinct Ed25519 key, isolated mounts, private output directory, no network, zero
  effective capabilities, and `NoNewPrivs`;
- executed the public visible-fixture attributor and prediction committer before making a scorer
  socket available;
- created a durable, signed prediction seal with exclusive creation plus file and directory sync;
- allowed only the scorer role to mount the public oracle join;
- executed seven authenticated scorer-release attacks and rejected all seven;
- created one bounded synthetic development candidate from sealed predictions only;
- registered that exact candidate as permanently non-promotable before execution;
- executed synthetic parent and candidate through the standalone agent runtime;
- evaluated signed runtime/verifier artifacts under a separate evaluator UID;
- recursively tainted exact, copied, aliased, wrapped, indirect, alternate-lifecycle, score-fed,
  promotion, and claim paths;
- produced a signed final audit receipt and self-contained evidence bundle;
- ran an independent verifier, TypeScript build, and the full 102-test deterministic suite.

Not performed:

- no API key, provider call, model billing, or provider result;
- no gate, final, temporal, withheld-public, multi-cause, or Terminal-Bench task body construction or
  access;
- no research scheduler or B0–B6 execution;
- no pilot, threshold calibration, confirmatory attribution, or research candidate selection;
- no qualification, promotion, canary, deployment, or production-pointer write;
- no performance, attribution-performance, generalization, containment, security, or self-improvement
  claim.

The user created `https://github.com/dsa04156/self-evolving-harness` and explicitly instructed periodic
repository updates. The implementation and this evidence checkpoint were therefore pushed to that
user-owned repository despite the prior packet’s conservative “no push” boundary. This was an explicit
user-authorized source/evidence publication action, not a provider or research action. No `.env`,
credential, API key, GitHub token, private signing key, sealed test body, or raw secret-bearing trace
was included. The committed evidence contains only ephemeral public verification keys. This disclosure
must not be read as retroactive Architect authorization for release or research publication.

## Exact source and evidence identity

Behavior-bearing implementation source:

- commit: `88e39cdebf1df4db7688fff592363f5f867533ce`
- tree: `ccb20381cc3308cb71954789614144575870eb83`

Committed evidence and trust-document checkpoint:

- commit: `a5d82564cece5ecb776a27c86512c3ec56f32787`
- tree: `1bbc1a7623460cf52907758e7ee93149e18a0aec`

Evidence:

- path: `architect/evidence/development-process-boundary/os-boundary.json`
- bytes: `169029`
- SHA-256:
  `7afe896e01409d4b97a01e6bfcdc8d327df8d81c464bc6c4282f7e276dfc82b9`
- manifest:
  `architect/evidence/development-process-boundary/manifest.json`
- manifest SHA-256:
  `bb4012c7a90c6a1fc7b004e179c6af212f5223027530f7f6231f521104a73bbd`

Verifier and process-boundary implementation hashes:

| File | SHA-256 |
|---|---|
| `schemas/development-process-boundary-evidence.schema.json` | `47af39e04d0f34bf7e5fee8dc4243109e0c239e409fb8bb0beaf1e74ddf8270b` |
| `scripts/verify-development-process-boundary.ts` | `9af7ce27d7c5b878dec6d25daabd8f16ae112b26407910377fc5ee634cf545fa` |
| `evaluator/development_boundary_gate.py` | `94c0a9e53ab1080afb7be95a0be91f278feec352c2bb6d661f7255c29a08c252` |
| `evaluator/development_score_gate.py` | `62c0052ab7c722cb3fe9356fb880e4ac909a39066b0296872e638233ab7179fa` |
| `scripts/development-boundary-worker.ts` | `d4131b1b4895534681f7bbeb13f97de39b590671f40c23624b3512f5f1891470` |

The evidence manifest pins Node `v24.18.1`, Python `3.13.14`, RootlessKit `2.3.6`, bubblewrap `0.9.0`,
OpenSSL `3.0.13`, no-network isolation, and provider `none`.

## OS-principal and authority matrix

The rootless namespace maps eight different namespace UIDs to eight different host subordinate UIDs.
Every role owns only its mode-0600 private key. No private key is retained in the evidence bundle.

| Role | Namespace UID | Observed host UID | Allowed authority |
|---|---:|---:|---|
| attributor | 1201 | 232272 | label-blind corpus → prototype and complete predictions |
| prediction committer | 1202 | 232273 | verify and sign prediction commitment and durable seal |
| scorer | 1203 | 232274 | sealed prediction + visible oracle → development diagnostic |
| mutation proposer | 1204 | 232275 | sealed predictions + synthetic parent → bounded proposal |
| candidate quarantine/operations | 1205 | 232276 | non-promotable registry and recursive taint |
| runtime | 1206 | 232277 | read-only parent/candidate execution with fake provider/tools |
| candidate evaluator | 1207 | 232278 | signed execution artifacts → synthetic evaluation result |
| audit | 1208 | 232279 | receipt, closure, taint, and claim-boundary verification |

For every role, the recorded probe shows:

- namespace UID and GID equal the assigned role identity;
- its own signing key is readable;
- seven cross-role forbidden reads are denied;
- seven cross-role forbidden writes are denied;
- effective capabilities are `0000000000000000`;
- `NoNewPrivs` is `1`;
- direct network access fails with `Network is unreachable`;
- a role-specific challenge signature verifies against the published public key.

The role receipts separately record accessible mount classes and deliberately absent capability
classes. Only `scorer` appears in `oracleMountRoles`. The proposer receives no scorer output, and the
runtime and evaluator operate from a separate read-only candidate registry view.

This is an OS-enforced local subordinate-UID boundary under the stated host TCB. It is not a malicious
host-root/kernel containment result.

## Prediction seal and scorer release

Before prediction commitment:

```text
earlyScorerSocketAbsent = true
```

The prediction committer receives the complete corpus, prototype, and prediction set; verifies their
closed schemas and hashes; signs the commitment; and writes a separate audit-bound prediction seal.
The seal path uses:

```text
appendMode = exclusive_create
fileSyncRequired = true
directorySyncRequired = true
```

Prediction-seal record hash:

```text
sha256:d54bcfd34a7e7cc8f61cc33bf235fba3f2f9e02b6a6d98c855a765f91ac383ac
```

Only after the audit side verifies the seal is the scorer socket created. The scorer gate then requires:

- expected committer UID from `SO_PEERCRED`;
- correct role-specific Ed25519 signature;
- a fresh request nonce and ordinal;
- exact protocol, corpus, prototype, prediction-set, commitment, and seal hashes;
- complete occurrence multiplicity;
- a score output whose claim and promotion flags remain false.

Accepted request:

```text
requestOrdinal = 6
reportHash = sha256:870115ddd0182851fbeed9159de15de55b5e51be7c3c6a0c0a6552ee0ee32c50
claimAuthorized = false
promotionAuthorized = false
```

Adversarial results:

| Case | Result |
|---|---|
| wrong peer UID | rejected `PermissionError` |
| wrong signing key | rejected `PermissionError` |
| commitment substitution | rejected `PermissionError` |
| prediction-set substitution | rejected `PermissionError` |
| corpus substitution | rejected `PermissionError` |
| seal substitution | rejected `PermissionError` |
| replay | rejected `REPLAY_REJECTED` |

All seven requests fail before any accepted score release. The attributor/proposer mount graph contains
no oracle or score-report edge.

## Adaptive development diagnostic

The OS-boundary process run is a new adaptive execution over the already public, development-exposed
visible corpus:

- corpus commitment:
  `sha256:49f7dcbfaabdc122294b41f30d56f15d5eca6088d7941f07483968bdd58e1a01`
- prototype:
  `development.os-boundary.attributor.v1`
- prototype manifest:
  `sha256:80e355020a4f2940f7ee168952f141ddb2348ff7ae38f18a4bbe2ad187594678`
- prediction set:
  `sha256:2598a006f2a5ba16b285e9de4a80bf73ed4602b0b7304e2a9e55dd702f40f5b8`
- prediction commitment:
  `sha256:e7727f49b42c5cb42afd306c7c1484153fb476293a1797d25c869fd3e14cd6db`
- oracle-access event:
  `sha256:d2d44818600bf6d6c59939b4c8b9d83428d5fc6a56d2ad3628a1b462b445fddd`

The score report contains 28 occurrence outcomes and all terminal-status counts. Its observed top-1 and
top-3 values differ from the prior in-process diagnostic because the development prototype identity and
test join are distinct. Those values are intentionally not elevated into this requested decision. They
remain adaptive public-fixture diagnostics with:

```text
developmentOnly = true
confirmatory = false
publicVisibleFixtures = true
authorizedForResearchEvidence = false
attributionPerformanceClaim = false
```

## Bounded candidate and actual standalone-runtime execution

The mutation proposer receives the sealed prediction artifacts, synthetic parent harness, immutable
component registry, and its own key. It receives neither oracle join, oracle-access event, score report,
nor scorer key.

One bounded declarative mutation changes one `WorkflowPolicy` action:

```text
construct_context → model_turn
```

Exact lineage:

- parent:
  `hv-sha256:cc4d6e6823863180f84297c11a690f1a65cfc6358c3400b515a55b84cc6d7d47`
- candidate:
  `hv-sha256:5f2c643e6b4549a11b6a5a443a246fc987792c0457964830b83beb6aabad9073`
- proposal:
  `sha256:72ba0c74f30eb512bc02d74ee43dcbe6508302d195b508df5a990027d5a35078`
- non-promotable record:
  `sha256:1e3af895021d996aab4867d26fc35b2cd7e5f0567d5e0d8dee56e99a6ed8a69e`

The operations role writes the non-promotable record before runtime execution and blocks the main
qualification lifecycle, research selection, canary, approved state, deployment, production pointer,
and research manifest.

Unlike Round 03RRR, the evaluator does not receive supplied pass/fail pairs. Runtime UID 1206 invokes
the standalone agent loop for both parent and candidate using:

- two fixed synthetic non-benchmark tasks;
- a deterministic request-observing `FakeProvider`;
- the project context builder, workflow dispatcher, and model/tool loop;
- immutable built-in tools;
- observable output/workspace verification;
- signed execution artifacts bound to exact parent/candidate IDs and closures.

Evaluator UID 1207 independently consumes those artifacts and produces:

- execution bundle:
  `sha256:d80841fbd3a3d985f83dd38ac1f96e0314ec490eeea14a36e9ea4d4f3638a2ec`
- evaluation result:
  `sha256:f9791d0c8c3e7c774c64f0000364ec5a7c40f3ba1cd65083b8098d52767ae995`
- source class: `derived_from_actual_standalone_runtime_evidence`

The observed two-task aggregate is:

```text
parentPassCount = 1
candidatePassCount = 2
failToPassCount = 1
passToFailCount = 0
researchMetric = false
promotionSignal = false
```

These values demonstrate that the runtime and evaluator react to the declarative behavior change. They
do not demonstrate reusable harness improvement: the tasks are synthetic, public to the developer,
and intentionally constructed to expose this one workflow transition.

## Recursive anti-laundering and quarantine

The exact candidate first enters the append-only non-promotable registry. A separate signed
`DevelopmentArtifactTaint` graph then propagates the development restriction through identity,
content, and dependency edges. The taint record hash is:

```text
sha256:12e7958b4cf85e841ae8a7c9b643e35d8709c2710d7e553c5c0de8a2bc76a3d2
```

The policy denies:

1. registering the exact candidate under another lifecycle;
2. copying the candidate/component manifest bytes under another ID;
3. aliasing an archived development candidate into a research manifest;
4. wrapping the proposal, mutation, execution, or evaluation in a new research record;
5. importing an indirect dependency path to any tainted artifact;
6. using the candidate/evaluation as promotion, canary, deployment, production-pointer, or claim input;
7. feeding scorer or oracle output back into a post-score proposer;
8. changing only the outer record identity while preserving tainted semantic content.

Candidate quarantine/operations, runtime, evaluator, and audit are four distinct UIDs. Runtime and
evaluator receive a materialized read-only registry view rather than the writable quarantine store.
The final audit binds eight per-role receipts plus one final audit receipt, for nine signed receipts
total.

This policy is stronger than exact-hash quarantine but remains bounded. A human could manually
reimplement similar semantics in unrelated bytes. Such a later artifact requires independent
provenance review and cannot inherit research eligibility merely because identity matching failed.

## Independent evidence verification

Command:

```text
npm run verify:development-process-boundary
```

The verifier does not invoke the generator. It:

- validates the evidence against the closed process-boundary JSON Schema;
- verifies every public principal, challenge signature, process identity, key owner, mount denial,
  capability/network result, and receipt signature;
- verifies the complete prediction/corpus/prototype/commitment/seal graph;
- checks seal chronology and durability declarations;
- validates all seven authenticated release rejections and the one accepted scorer request;
- reconstructs parent and candidate component registries and their closures;
- verifies the bounded mutation and exact candidate lineage;
- verifies actual runtime execution and candidate evaluation signatures and hashes;
- reconstructs recursive taint and non-promotability;
- verifies nine signed receipts and final audit summary;
- requires provider, research-evidence, promotion, and claim authority to remain false.

Verifier output:

```json
{
  "verified": true,
  "roleCount": 8,
  "receiptCount": 9,
  "adversarialRejectionCount": 7,
  "providerUsed": false,
  "researchEvidenceAuthorized": false,
  "promotionAuthorized": false
}
```

## Validation

Current clean-checkpoint validation:

| Check | Result |
|---|---|
| independent process-boundary verifier | pass |
| TypeScript build | pass |
| patch hygiene | pass |
| isolated CONNECT broker regression | 1/1 pass |
| full deterministic suite | 102/102 pass |
| failed/cancelled/skipped/todo | 0/0/0/0 |

The first parallel orchestration attempt overlapped the full suite with verifier/build work and
observed one transient CONNECT-broker failure. The broker test immediately passed alone, and a clean
full-suite rerun passed 102/102 including the same broker case. This is disclosed rather than omitted;
the accepted validation result is the non-overlapped full rerun.

The most recent coverage run after the process-boundary implementation, before documentation-only
changes, reported:

```text
line = 94.92%
branch = 89.19%
function = 92.72%
```

Coverage is supporting development evidence only and not an Architect acceptance threshold.

## Secret and publication check

Before the GitHub checkpoint, both tracked `HEAD` and the complete working tree were scanned for:

- PEM private-key headers;
- OpenAI/Anthropic key assignments;
- GitHub classic-token patterns;
- common `sk-` and `sk-proj-` credential forms.

No actual secret matched. The only key-related text match was the literal diagnostic
`OPENAI_API_KEY=absent`. No `.env*` file exists. Evidence public keys are explicitly labelled
`BEGIN PUBLIC KEY`; ephemeral private keys existed only in temporary per-role vaults removed after the
test.

## Trust limits and open issues

Remaining limits:

1. RootlessKit, bubblewrap, the Linux kernel, filesystem durability, host root, bootstrapping code, and
   protocol-author inputs remain trusted.
2. Public visible fixtures make every diagnostic adaptive development feedback.
3. The scorer oracle is synthetic/public and does not establish evaluator-vault secrecy for future
   gate/final data.
4. Recursive taint detects known identity/content/dependency laundering but not arbitrary human
   semantic reimplementation.
5. The two synthetic tasks demonstrate runtime causality/plumbing, not external validity or
   generalization.
6. The OpenAI provider adapter is implemented and contract-tested, but no API key is present and no
   real-provider receipt exists.
7. No research protocol execution, candidate comparison, or empirical self-evolution result exists.
8. Publishing source and development evidence to the user-owned GitHub repository increases public
   exposure; those exact public fixtures cannot later be reclassified as held-out.

## Requested next bounded scope

If this packet is `APPROVE`, authorize only the following no-provider, no-research next scope:

1. complete root `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, `REPRODUCIBILITY.md`,
   `LIMITATIONS.md`, and `NEGATIVE_RESULTS.md` from current evidence;
2. implement and deterministically test an evaluator-vault and independent-authorship workflow
   contract without constructing or opening any gate/final/temporal/withheld-public task body;
3. add static contamination/access-ledger checks that make public-development artifacts permanently
   ineligible for held-out roles;
4. prepare a revised Gate 2/runtime-and-trust closure packet that accurately records the standalone
   runtime, process boundaries, no-provider limitation, and remaining Gate 3 blocker.

Do not authorize from this packet:

- a real provider call or credential request;
- research scheduler/B0–B6 execution;
- pilot or threshold calibration;
- confirmatory attribution;
- gate, final, temporal, withheld-public, or Terminal-Bench body access;
- research candidate selection;
- qualification, promotion, canary, deployment, or production-pointer changes;
- performance, attribution-performance, generalization, security, or self-improvement claims.

