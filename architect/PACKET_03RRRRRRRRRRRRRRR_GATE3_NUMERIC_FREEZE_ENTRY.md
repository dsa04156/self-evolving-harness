# Architect Packet 03RRRRRRRRRRRRRRR — No-execution Gate 3 numeric-freeze entry

Date: 2026-08-03  
Requested decision: `APPROVE`, `REVISE`, or `BLOCK` for this preregistration only

## Review boundary

This packet selects exactly one unresolved obligation:

```text
research_protocol_numeric_freeze
```

The selected obligation remains `unresolved` and `evidencePresent=false`. This packet does not partially
complete it. It preregisters a zero-execution entry contract and asks whether the next local action may be
limited to an offline, signed entry record plus its deterministic verifier and adversarial tests.

The other six obligations remain untouched. The signed trust-plane conformance manifest, canonical
reviewer-blinding lineage, governance histories, and outstanding-obligations matrix are not modified or
regenerated.

This packet contains no credential, API key request, provider/model call, real benchmark body, verifier
logic, label, expected answer, task handle, benchmark path, gate/final/temporal/withheld material, raw
trace, research scheduler execution, B0–B6 run, pilot, attribution experiment, candidate selection,
promotion, deployment, release, publication, or empirical claim. No Git push is performed.

## 1. Current source and conformance identity

| Item | Identity |
|---|---|
| Current local commit | `91bfefe29ecc5ab12a0f3110417560384abf5d2e` |
| Current local tree | `90748bf48016612e5055eef464d160c3e81d8746` |
| Current branch | `main` |
| Remote-tracking commit | `8b5f14400a7723c821bc54420e55da58dfa7601b` |
| Remote-tracking tree | `1237af51815e9fd941c62ceb130d063584e13331` |
| Local commits ahead | `20` |
| Push in this entry | `false` |
| Conformance manifest source commit | `8de2c68b04dc567b5b82e87bd8f7cecad62e48f7` |
| Conformance manifest source tree | `5760a871bc92c53d2c8656fbe50e3598f04eab93` |
| Conformance manifest raw SHA-256 | `9195b10340ac8687d151fd10c910af973b5f07c264fd32fd318bc08c312f3323` |
| Conformance manifest internal hash | `sha256:3b8fe7c08448ac347ac4882e4eabd2ea0b85bb911e77a3e47e904cbe1ea1db49` |
| Outstanding-obligations SHA-256 | `4fbc10b5febaac8296d53d7a97720c1c4b28bcd4a5bd9ef0582e77b11f586f58` |
| Prior packet SHA-256 | `0f4fb1fc000641307a1c851f20a7df114929f8ef765d1b853356c43238d1b652` |
| Prior response SHA-256 | `9d0eb8e4fc7c1f589aae900dc50d878f091495fb13d8ed3a5529cc70637739fc` |

The current manifest still verifies as schema v2 with seven evidence domains, 52 referenced artifacts,
20 source-commit references, two governance chains, 11 ordinary identity bindings, one canonical
control lineage, two canonical cross-domain bindings, seven unresolved obligations, and zero granted
authorities.

## 2. Selected objective and completion boundary

The future completion condition for `research_protocol_numeric_freeze` is all of the following:

1. one content-addressed `ProtocolManifest` with every immutable pin populated;
2. one signed `BudgetFreezeManifest` whose model, tool set, environment, permission policy, methods,
   rollout seeds, solver slots, phase caps, request caps, and source configuration are exact;
3. numeric values derived only under a separately approved mine/dedicated-pilot calibration contract;
4. no remaining sentinel in any field enumerated by `pilotPendingFields`;
5. a valid protocol-author signature, independent deterministic verification, and append-only audit
   receipt;
6. source, policy, environment, model, split, evaluator, and analysis identities unchanged between
   freeze and the first research transaction; and
7. a later Architect ruling that explicitly accepts the completed freeze before any gate, final,
   selection, promotion, or claim action.

Neither this packet nor the proposed offline entry record satisfies those conditions. The obligation
must remain unresolved until the complete signed freeze exists and is separately reviewed.

## 3. Protocol and policy identities bound at entry

The entry contract binds the current reviewed inputs without converting them into a frozen research
protocol:

| Artifact | Current identity | Entry treatment |
|---|---|---|
| `configs/evaluation-budget.yaml` | SHA-256 `010e508d18e7bca6697841b8ed1c33b8e060f946c6e975eb0a65a353f84d5b4d` | structural draft only; `protocolVersion=draft-1` |
| `configs/gate-feedback-policy.yaml` | SHA-256 `11b6645fd7a659dc920950f7340122f38d3c1f4b87e56d1e26f0d92e96bdcea7` | one-shot feedback and selection policy candidate |
| `configs/component-type-registry.json` | SHA-256 `d93cb03973a6552db1d7e894bf65f492a4dc308225eaf9a965361c9f5db8dfb0` | component grammar identity candidate |
| `docs/evaluation/budget-contract.md` | SHA-256 `15c478817f8335f2f8adc2cefa3957a3c5623f013ac54c4e2025c79e61b8b798` | normative draft rule |
| `docs/evaluation/statistical-analysis-plan.md` | SHA-256 `93a221dfc8072e99e44fa350df953b1cd5fa9af1f67275ef6ae957c0a3d66930` | statistical-plan candidate |
| `docs/evaluation/data-access-policy.md` | SHA-256 `18dda4d282ee365d20b1e92ca2d99891ce14950b79c2e0cf361aee9ee6619113` | data-access-policy candidate |
| `schemas/protocol-manifest.schema.json` | SHA-256 `8be3e500b3e77b417f0259d052ed8af57e7172434c4b7d906f01b76a470404aa` | immutable schema candidate |
| `schemas/budget-freeze-manifest.schema.json` | SHA-256 `1853a22be0ce077c9e798d9ed9d00e0ef04ed8dfc685ee8f163e68cbd5dda689` | immutable schema candidate |
| `schemas/phase-budget-record.schema.json` | SHA-256 `5ba9dfd414d1e55dad582a0ed65b09c838ef38146fdebef089c08bc692140bb0` | resource-ledger schema candidate |
| principal-capability matrix | SHA-256 `9103f8b164003866cac64ee0eb867086fdba32aa61c90177386863e69e1d2423` | authority boundary candidate |
| trust-boundary contract | SHA-256 `622aa61699fa1c0ef58acfa803b7a02d20ca0b8e4edd1476bb39155ed875cdfd` | immutable trust boundary candidate |
| threat model | SHA-256 `350cd7ae95f718b4b34dfcd53c2665f052c31cd0f204dc1787d3eeded00ac6bc` | risk and abort contract candidate |

No final `protocolId` or `budgetFreezeId` is allocated at entry. Both are content-derived only after all
required identities and numeric fields exist. Allocating either ID while a required pin or numeric
field remains absent is a failure.

The literal `PILOT_PENDING` values in the current evaluation budget are intentional unresolved
sentinels. This packet neither replaces nor silently interprets them. A future freeze must replace all
of them in one reviewed protocol transaction or create no research protocol.

## 4. Explicit exclusion of the old synthetic provider artifact

`architect/evidence/gate3/provider-budget-freeze.json` has raw SHA-256:

```text
70754dc8ca684a8acbc4638e76dee62c17186e2b437ae2d4eeb09b763af813dd
```

It is a deterministic development/provider-smoke fixture with placeholder-like test digests, `B0` only,
one rollout seed, and scope `provider_smoke`. It is not a research numeric freeze, not pilot evidence,
not a source of production caps, not eligible for confirmatory use, and not a predecessor that the
future research budget may supersede. Its presence cannot satisfy any part of the selected obligation.

The stale provider/model planning files associated with the earlier provider-smoke proposal are also
excluded. This entry selects no provider, model, service tier, credential mechanism, or paid execution
path. Codex CLI is not treated as a model-provider adapter or hidden execution backend.

## 5. Participating principals and exact authority state

Only governance planning roles participate in this entry:

| Principal | Permitted entry action | Forbidden entry action |
|---|---|---|
| protocol author | describe and later, only if authorized, sign one non-research entry record | allocate final protocol ID, fill pilot values, access results, run provider or benchmark |
| audit store | later verify and append one entry receipt if authorized | read credentials/task bodies, alter policy, grant execution authority |
| deterministic validator | verify hashes, schema, zero budgets, and authority flags | call a model/tool, read benchmark material, interpret performance |
| workspace owner | request Architect review | supply credentials or authorize research through this packet |

Runtime, operations owner, proposer, evaluator, scorer, promoter, provider proxy, benchmark author,
benchmark reviewer, evaluator vault, and deployment registry perform zero selected-obligation actions.

The following state is exact and must remain unchanged:

```text
providerExecutionAuthorized  = false
researchEvidenceAuthorized   = false
candidateSelectionAuthorized = false
promotionAuthorized          = false
deploymentAuthorized         = false
claimAuthorityGranted        = false
```

The entry record, if later authorized, must be signed only by a dedicated protocol-author identity and
must not reuse evaluator, promoter, provider, runtime, proposer, or audit private authority. No private
key material is included in this packet or transmitted to the Architect.

## 6. Permitted and prohibited data classes

Permitted input is limited to `publicDevelopment` metadata already present in the repository:

- the exact source/tree and hashes listed in this packet;
- public architecture, policy, schema, and threat-model text;
- zero-authority conformance status;
- deterministic validator/test summaries that contain no task or provider content; and
- the Architect packet and ruling hashes.

Prohibited input includes:

- any real, gate, final, temporal, sealed, withheld, confirmatory, or research-evidence task content;
- benchmark file names or paths that reveal protected split membership;
- verifier source, diagnostics, labels, expected answers, per-task outcomes, task handles, or traces;
- API credentials, browser/session secrets, provider request or response content;
- model-generated pilot measurements or performance estimates;
- candidate artifacts, selection packets, promotion inputs, and deployment state; and
- the quarantined structural-oracle artifacts as research evidence.

Any prohibited input makes the entry attempt fail closed and permanently ineligible as research
evidence.

## 7. Exact no-execution budget and attempt limits

For this selected-obligation entry phase, every research or runtime resource cap is zero:

| Resource / action | Maximum |
|---|---:|
| provider/model request attempts | 0 |
| charged or estimated provider tokens | 0 |
| provider cost | 0 |
| runtime tool attempts | 0 |
| benchmark/vault unlocks | 0 |
| gate/final/temporal accesses | 0 |
| feedback releases | 0 |
| research scheduler processes | 0 |
| task executions | 0 |
| mutation proposals | 0 |
| candidate manifests | 0 |
| evaluation results | 0 |
| selections/promotions/deployments | 0 |
| Git pushes | 0 |

The governance review is outside the experimental resource ledger and cannot become research evidence.
It is separately bounded to one outgoing text packet, at most 20,000 UTF-8 bytes, sent once to the
already-recorded ChatGPT Pro conversation tab; one primary Architect ruling; zero file uploads,
screenshots, new tabs, new windows, or conversation resets. A `REVISE` or `BLOCK` result does not permit
an automatic second transmission under this entry contract.

If a later packet proposes a calibration or provider execution, it must state a complete nonzero budget
and exact model/environment identity and obtain a new ruling before the first call. Nothing in this
packet reserves or implies such a budget.

## 8. Required success, failure, and abort evidence

### Entry success

Entry success requires all of:

1. one exact-tab Architect response with primary decision `APPROVE`;
2. packet and response SHA-256 values stored in the append-only local Architect ledger;
3. current source/tree, conformance hash, policy hashes, selected obligation, zero budget, data class,
   and authority state accepted without widening;
4. explicit authorization, if any, limited to an offline entry-record schema, signed record, verifier,
   adversarial tests, and documentation; and
5. the selected obligation still recorded as unresolved afterward.

### Entry failure

Any of the following is failure:

- Architect decision `REVISE` or `BLOCK`;
- a missing or changed source, manifest, policy, schema, or obligation hash;
- a nonzero research/provider/task budget;
- allocating a final protocol/budget identity before every pin and number exists;
- treating a sentinel, synthetic fixture, or quarantined artifact as a frozen value;
- setting any authority or eligibility flag to true; or
- describing the selected obligation as partially completed.

### Mandatory abort

Abort before transmission or local implementation if:

- the recorded Chrome endpoint, exact target, or conversation URL does not match;
- the composer is nonempty or another send is in progress;
- packet redaction, size, or secret scan fails;
- a new sensitive data category or real-data path appears;
- current source, conformance manifest, governance history, or obligations drift;
- a credential prompt or provider execution becomes necessary; or
- any proposed action exceeds the one-objective, zero-execution boundary.

Abort evidence is a local reason record only. It grants no retry, execution, or protocol authority.

## 9. Contamination and eligibility contract

This packet, the Architect ruling, and any later authorized entry-record implementation are:

```text
publicDevelopment              = true
authorizedForResearchEvidence  = false
confirmatory                   = false
eligibleForGate                = false
eligibleForFinal               = false
eligibleForHeldOut             = false
eligibleForSealed              = false
eligibleForTemporalHoldout     = false
authorizedForPromotion         = false
```

They may prove only that an entry boundary was specified and locally validated. They may not be used as
pilot evidence, performance evidence, attribution evidence, selection input, or a security claim.

Exposure to prohibited material, use of quarantined evidence, or a policy/hash change requires a new
entry identity and permanently marks the affected attempt non-confirmatory. Cross-protocol pooling is
forbidden.

## 10. Rollback and abandonment

This packet changes no runtime, protocol pointer, candidate, registry, deployment, or obligation state,
so there is no operational rollback.

- Before an Architect ruling, an uncommitted packet may be abandoned without creating an active record.
- After transmission, packet and response are retained as immutable governance history regardless of
  decision.
- A `REVISE` or `BLOCK` decision leaves all seven obligations and all authority flags unchanged.
- A later offline entry record, if approved and then superseded, is append-only historical evidence; it
  is never edited into a research protocol.
- Any future full protocol uses a new content-derived identity. It cannot overwrite the entry record or
  claim continuity with the excluded synthetic provider fixture.
- Abandonment requires no provider cancellation, candidate rollback, or deployment CAS because all such
  counts and authorities are zero.

## 11. Requested ruling and narrow next scope

Please issue exactly one primary decision:

```text
APPROVE
REVISE
BLOCK
```

Please use:

```text
DECISION:
ONE_OBJECTIVE_SELECTION:
SOURCE_AND_POLICY_BINDINGS:
ZERO_BUDGET_AND_DATA_BOUNDARY:
SUCCESS_FAILURE_ABORT_EVIDENCE:
CONTAMINATION_AND_ELIGIBILITY:
ROLLBACK_AND_ABANDONMENT:
BLOCKING_FINDINGS:
AUTHORIZED_NEXT_SCOPE:
```

Please assess:

1. Does this packet select only `research_protocol_numeric_freeze` while leaving it unresolved?
2. Are the current source, conformance manifest, policy/schema identities, principals, data class, zero
   resource budget, evidence conditions, contamination rules, and abandonment behavior sufficiently
   bound for a no-execution entry?
3. Is the synthetic provider budget fixture excluded strongly enough to prevent research laundering?
4. Does the entry avoid allocating a protocol identity or filling pilot-derived numbers prematurely?
5. If approved, may the next local scope contain only:
   - one schema for a non-research numeric-freeze entry record;
   - one signed public-development record;
   - one deterministic verifier;
   - adversarial tests for hash drift, nonzero budgets, authority escalation, synthetic-fixture reuse,
     sentinel laundering, prohibited data classes, and premature protocol-ID allocation; and
   - documentation and the next correction/review packet?
6. If that offline scope is insufficient or unnecessary, what is the smallest safe next step that still
   requires zero provider, benchmark, research, selection, promotion, deployment, and claim authority?

No execution beyond the scope explicitly returned in `AUTHORIZED_NEXT_SCOPE` is requested.
