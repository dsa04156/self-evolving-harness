# HarnessFaultBench-v0 Fixture Construction Contract

Status: **FROZEN CONTRACT; D_MINE IMPLEMENTED; GATE/FINAL BODIES NOT INSTANTIATED**
Specification version: `hfb-fixture-spec-1.0.1`
Change rule: any semantic change after Gate 1 approval requires a new spec/protocol ID and Architect review

## Purpose and non-claim

HarnessFaultBench measures whether a system attributes deterministic, known injected harness defects to
the correct component. It does not measure general coding ability, real-provider capability, or
self-improvement.

The checked-in executable implementation is restricted to IDs `01–04` (`D_mine`). Its synthetic
author/reviewer identities support deterministic development validation only and do not satisfy the
independent-authorship condition for a sealed dataset. IDs `05–08` and all multi-cause bodies remain
uninstantiated.

## Fixed inventory

Seven fault families have eight single-fault cases each:

1. `SystemPrompt`
2. `ContextPolicy`
3. `MemoryRetrievalPolicy`
4. `Skill`
5. `WorkflowPolicy`
6. exact `RoutingPolicy` or `SubagentPrompt`, balanced under the published combined stratum
7. `ToolDescription`

IDs `01–04` are mine, `05–06` gate, and `07–08` final. Each index has the same difficulty band in every
family:

| Index | Role | Difficulty | Reference solver stages | Reference tool results |
|---:|---|---|---:|---:|
| 01 | mine | low | 2–3 | 1 |
| 02 | mine | medium | 4–5 | 2 |
| 03 | mine | high | 6–8 | 3–4 |
| 04 | mine | low | 2–3 | 1 |
| 05 | gate | medium | 4–5 | 2 |
| 06 | gate | high | 6–8 | 3–4 |
| 07 | final | low | 2–3 | 1 |
| 08 | final | medium | 4–5 | 2 |

Difficulty is a fixture-complexity stratum, not a post-result label.

## Common case template

Every case package conforms to `schemas/benchmarks/harness-fault-fixture.schema.json` and contains:

- content-addressed known-good and faulty whole-harness manifests;
- exactly one schema-valid declarative JSON Patch for single-fault cases;
- task input and initial fake filesystem/memory state;
- a finite fake-provider transition table;
- a finite fake-tool result table;
- expected good/faulty event-type sequence and terminal verifier outcome;
- evaluator-only ground-truth component ID/type and mechanism code;
- causal-intervention outcomes;
- author, independent reviewer, hashes, and deterministic scorer version.

Fake provider and tools are finite data tables interpreted by immutable test code. They contain no Python,
JavaScript, shell, network, dynamic import, regex, or callback.

## Single-fault mechanics

All patches remain valid under their payload schema and add no capability. They alter one JSON value,
remove one optional/ordered item, or retarget one existing ID. Static schema/security failure is not the
intended signal.

### SystemPrompt

| Index | Mechanism code | Injected defect |
|---:|---|---|
| 01 | `SP_OMIT_OUTPUT_CONTRACT` | remove the section that names the required final artifact marker |
| 02 | `SP_INVERT_TOOL_ORDER` | reverse the already-authorized inspect-before-edit guidance |
| 03 | `SP_OMIT_FAILURE_HANDLING` | remove the bounded recovery instruction required after the scripted tool failure |
| 04 | `SP_PREMATURE_COMPLETION` | change completion guidance to allow completion before the existing verification outcome |
| 05 | `SP_WRONG_ARTIFACT_PATH` | substitute an existing decoy relative path for the required artifact path |
| 06 | `SP_OMIT_VERIFICATION_STEP` | remove the prompt section requiring the declared verifier action |
| 07 | `SP_INVERT_SUCCESS_CRITERION` | invert one task-visible boolean success condition |
| 08 | `SP_IGNORE_REQUIRED_DIFF` | remove the instruction to inspect the declared diff artifact before completion |

### ContextPolicy

| Index | Mechanism code | Injected defect |
|---:|---|---|
| 01 | `CP_EXCLUDE_LATEST_TOOL_RESULT` | set the existing tool-result source limit so the latest result is excluded |
| 02 | `CP_TRUNCATE_TASK_REQUIREMENT` | lower the task-input allocation below the predeclared distinguishing suffix |
| 03 | `CP_SELECT_STALE_SESSION_EVENT` | switch selection from latest-first to earliest-first in a scripted stale/updated pair |
| 04 | `CP_OMIT_TOOL_CATALOG` | remove the tool-catalog source needed to identify an existing tool |
| 05 | `CP_DROP_VERIFICATION_FEEDBACK` | remove the verification-feedback source after the scripted first failure |
| 06 | `CP_DROP_SELECTED_SKILL` | remove the selected-skill source required for the high-complexity sequence |
| 07 | `CP_LOW_TOTAL_TOKEN_LIMIT` | lower the valid total limit so one required low-case fact is deterministically dropped |
| 08 | `CP_WRONG_OVERFLOW_PRIORITY` | change source priority so a decoy summary survives instead of the required current fact |

### MemoryRetrievalPolicy

| Index | Mechanism code | Injected defect |
|---:|---|---|
| 01 | `MRP_OMIT_PROJECT_FACTS` | remove the existing `project_facts` namespace |
| 02 | `MRP_SCORE_TOO_HIGH` | raise minimum score above the required record's fixed score |
| 03 | `MRP_ZERO_RECORD_LIMIT` | set `maxRecords` to zero |
| 04 | `MRP_RECENCY_SELECTS_DECOY` | choose recency instead of the fixed lexical mode in a stale-decoy fixture |
| 05 | `MRP_OMIT_ACCEPTED_LESSONS` | remove the required `accepted_lessons` namespace |
| 06 | `MRP_WRONG_TIE_BREAK` | choose the existing tie-break that deterministically ranks the decoy first |
| 07 | `MRP_TOKEN_LIMIT_TRUNCATES_FACT` | lower the valid token limit below the required fact length |
| 08 | `MRP_HYBRID_WEIGHT_SELECTS_DECOY` | change the fixed hybrid weight across the declared deterministic boundary |

### Skill

| Index | Mechanism code | Injected defect |
|---:|---|---|
| 01 | `SK_OMIT_REQUIRED_STEP` | remove one required instruction step |
| 02 | `SK_SWAP_EXISTING_STEPS` | swap inspect and edit guidance |
| 03 | `SK_WRONG_COMPLETION_CHECK` | replace one check with the existing inverse condition |
| 04 | `SK_WRONG_EXISTING_TOOL_GUIDANCE` | retarget guidance to another already-authorized tool |
| 05 | `SK_PREMATURE_COMPLETION_CHECK` | move the completion check before evidence inspection |
| 06 | `SK_OMIT_EVIDENCE_CHECK` | remove the declared evidence-check step |
| 07 | `SK_WRONG_DECLARED_FILE_SCOPE` | replace the target relative path in prose with a fixture decoy path |
| 08 | `SK_REVERSE_EXPECTED_CONDITION` | invert the expected deterministic tool-result condition |

### WorkflowPolicy

| Index | Mechanism code | Injected defect |
|---:|---|---|
| 01 | `WF_SKIP_CONTEXT_CONSTRUCTION` | retarget the entry transition directly to model turn |
| 02 | `WF_TOOL_FAILURE_TO_COMPLETE` | retarget the existing tool-failure transition to a terminal state |
| 03 | `WF_VERIFY_FAILURE_TO_COMPLETE` | retarget verification failure to completion |
| 04 | `WF_JOB_RESULT_WRONG_STATE` | send the scripted job-complete trigger to a stale pre-job state |
| 05 | `WF_OMIT_VERIFY_ACTION` | remove the existing verify action from its state |
| 06 | `WF_PERMISSION_DENIED_WRONG_BRANCH` | retarget permission denial to the bounded retry branch instead of block |
| 07 | `WF_WRONG_EXISTING_SKILL_TARGET` | retarget `invoke_skill` to a declared decoy skill |
| 08 | `WF_PREMATURE_TERMINAL_STATE` | add an existing pre-verification state to `terminalStates` |

### RoutingPolicy / SubagentPrompt

Odd IDs inject `RoutingPolicy`; even IDs inject `SubagentPrompt`. The exact type is the ground-truth label.

| Index | Exact type | Mechanism code | Injected defect |
|---:|---|---|---|
| 01 | RoutingPolicy | `RT_WRONG_LOW_RULE` | retarget the matching low-risk task to the declared decoy route |
| 02 | SubagentPrompt | `SA_OMIT_ARTIFACT_REQUIREMENT` | remove the required artifact instruction |
| 03 | RoutingPolicy | `RT_WRONG_HIGH_RULE` | retarget the matching high-complexity task to the incapable existing route |
| 04 | SubagentPrompt | `SA_INVERT_SUCCESS_CONDITION` | invert the task-visible success condition |
| 05 | RoutingPolicy | `RT_PRIORITY_SHADOWS_MATCH` | change priorities so an existing broader rule wins |
| 06 | SubagentPrompt | `SA_WRONG_TOOL_SEQUENCE` | reverse the existing inspect/edit guidance |
| 07 | RoutingPolicy | `RT_HIGH_RISK_TO_LOW_AUTHORITY` | select an existing route whose immutable permission ceiling cannot complete the task |
| 08 | SubagentPrompt | `SA_COMPLETE_WITHOUT_EVIDENCE` | remove evidence-before-completion guidance |

### ToolDescription

The bound immutable tool ID, implementation, machine input schema, permission, and executor behavior never
change.

| Index | Mechanism code | Injected defect |
|---:|---|---|
| 01 | `TD_WRONG_READ_PARAMETER_PROSE` | describe an existing read parameter with the decoy meaning |
| 02 | `TD_INVERT_EDIT_MODE_PROSE` | swap prose meanings of two existing edit modes |
| 03 | `TD_WRONG_RESULT_FIELD_PROSE` | describe the existing result field as containing a different fixed value |
| 04 | `TD_GIT_DIFF_SCOPE_PROSE` | claim the diff covers only the wrong existing scope |
| 05 | `TD_WRITE_EXISTENCE_SEMANTICS` | invert prose about the existing create/replace behavior |
| 06 | `TD_READ_LINE_NUMBER_SEMANTICS` | describe zero-based instead of one-based line positions |
| 07 | `TD_WRONG_VERIFICATION_TOOL_GUIDANCE` | recommend an existing non-verifying Git tool for the task |
| 08 | `TD_INVERT_ERROR_CODE_PROSE` | invert success/failure meaning of two declared error codes |

## Single-fault causal oracle

A fixture is admitted only if all deterministic interventions hold:

1. known-good harness passes;
2. faulty harness fails with the declared terminal reason;
3. replacing only the injected component manifest with the known-good component passes;
4. replacing any other mutable component while retaining the injected component still fails;
5. parent/faulty manifests differ in exactly one stable component family and the declared JSON Patch;
6. both variants pass static schema, immutable-boundary, safety, permission, and budget validation;
7. three independent replays produce identical event-type/payload-hash chains and outcomes.

Failure of any intervention makes the fixture invalid before split sealing.

## Multi-cause challenge

The machine-readable source for this table is `multicause-graph.json`. The 14 final-only pairs are the
edges of one degree-four graph over seven **combined fault families**.
`RoutingPolicy` and `SubagentPrompt` are exact ground-truth types but share the one combined
routing/subagent family used for balance. Degree four is an overall property, not a per-difficulty claim.

The medium edges and high edges each form a degree-two seven-family cycle; their union gives degree four
for every combined family. The table freezes every edge, difficulty, exact type, and mechanism:

| ID | Ground-truth pair | Difficulty | Exact mechanisms |
|---:|---|---|---|
| 01 | SystemPrompt + MemoryRetrievalPolicy | medium | `SP_OMIT_OUTPUT_CONTRACT` + `MRP_OMIT_PROJECT_FACTS` |
| 02 | SystemPrompt + Skill | high | `SP_INVERT_TOOL_ORDER` + `SK_OMIT_REQUIRED_STEP` |
| 03 | SystemPrompt + WorkflowPolicy | high | `SP_OMIT_FAILURE_HANDLING` + `WF_SKIP_CONTEXT_CONSTRUCTION` |
| 04 | SystemPrompt + SubagentPrompt | medium | `SP_PREMATURE_COMPLETION` + `SA_OMIT_ARTIFACT_REQUIREMENT` |
| 05 | ContextPolicy + Skill | medium | `CP_EXCLUDE_LATEST_TOOL_RESULT` + `SK_SWAP_EXISTING_STEPS` |
| 06 | ContextPolicy + WorkflowPolicy | high | `CP_TRUNCATE_TASK_REQUIREMENT` + `WF_TOOL_FAILURE_TO_COMPLETE` |
| 07 | ContextPolicy + RoutingPolicy | high | `CP_SELECT_STALE_SESSION_EVENT` + `RT_WRONG_LOW_RULE` |
| 08 | ContextPolicy + ToolDescription | medium | `CP_OMIT_TOOL_CATALOG` + `TD_WRONG_READ_PARAMETER_PROSE` |
| 09 | MemoryRetrievalPolicy + WorkflowPolicy | medium | `MRP_SCORE_TOO_HIGH` + `WF_VERIFY_FAILURE_TO_COMPLETE` |
| 10 | MemoryRetrievalPolicy + SubagentPrompt | high | `MRP_ZERO_RECORD_LIMIT` + `SA_INVERT_SUCCESS_CONDITION` |
| 11 | MemoryRetrievalPolicy + ToolDescription | high | `MRP_RECENCY_SELECTS_DECOY` + `TD_INVERT_EDIT_MODE_PROSE` |
| 12 | Skill + RoutingPolicy | medium | `SK_WRONG_COMPLETION_CHECK` + `RT_WRONG_HIGH_RULE` |
| 13 | Skill + ToolDescription | high | `SK_WRONG_EXISTING_TOOL_GUIDANCE` + `TD_WRONG_RESULT_FIELD_PROSE` |
| 14 | WorkflowPolicy + ToolDescription | medium | `WF_JOB_RESULT_WRONG_STATE` + `TD_GIT_DIFF_SCOPE_PROSE` |

Medium cycle:

```text
SystemPrompt — MemoryRetrievalPolicy — WorkflowPolicy — ToolDescription
— ContextPolicy — Skill — Routing/Subagent — SystemPrompt
```

High cycle:

```text
SystemPrompt — Skill — ToolDescription — MemoryRetrievalPolicy
— Routing/Subagent — ContextPolicy — WorkflowPolicy — SystemPrompt
```

Both defects produce separate required-subgoal failures: restoring neither or only one fails; restoring
both passes. No third mutable component restoration may pass. Fixture implementation may instantiate
prose and finite table values but cannot substitute another edge, difficulty, exact type, or mechanism.

## Attribution labels and ambiguity

Ground truth is the stable component ID, exact type-registry entry, and mechanism code. A human category
name alone is insufficient.

Two reviewers independently inspect the patch and causal-intervention report without seeing model
attribution. Disagreement, alternate causal component, nonunique minimal repair, or scorer ambiguity
rejects the case. Rejected cases keep IDs reserved; they are not replaced after any candidate outcome.

## Deterministic scorer

Predictions are a strict ordered list of distinct component IDs. Ties, missing IDs, unknown IDs, or extra
free-form labels score as incorrect.

- single-fault top-1: first ID equals ground truth;
- single-fault top-3: ground truth occurs in first three;
- multi-cause recall@2: intersection size of first two IDs and the two-ID ground truth divided by two;
- exact-set@2: first-two set equals ground truth.

Macro scores average tasks equally; family-stratified scores are secondary. Gate uses only single-fault
top-1/top-3. Multi-cause metrics are final-only and cannot affect promotion or tuning.

## Authorship, sealing, and review

Mine fixtures may be visible to development. Gate bodies and labels are evaluator-vault only. Final
fixtures may be called sealed only when:

- instantiated by an independent benchmark-author identity after runtime/attribution implementation
  freeze;
- reviewed by a second independent identity;
- task/provider/tool tables, labels, verifier, and hashes never enter developer/proposer/model-selection
  mounts;
- content commitments predate every final candidate execution;
- access audit shows no prohibited principal read.

If these conditions are not met, reports rename them `developer-withheld final fixtures` and remove the
sealed-data claim.

## Freeze and implementation rule

Fixture implementation may fill only task prose, decoy values, content hashes, and finite table rows that
instantiate this contract. It cannot change component family/type, mechanism, split, difficulty band,
causal oracle, metric, pair graph, scorer, or inclusion rule. Any needed semantic change increments the
spec/protocol before observations and invalidates prior confirmatory pooling.
