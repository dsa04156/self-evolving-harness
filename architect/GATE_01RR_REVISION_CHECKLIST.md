# Gate 1RR Contract-Correction Checklist

Status: **EXTERNAL DECISION RECEIVED — REVISE**
Source decision: `.codex/gpt-pro-architect/responses/response-1r.md`
Decision: `REVISE`
Protocol candidate remains: `draft-1`

This checklist is limited to the ten revisions authorized by the Gate 1R decision. It does not reopen
accepted prior-art, novelty, runtime, trust-boundary, or evaluation-design topics, and it does not
authorize implementation.

| ID | Required correction | Primary artifact(s) | Deterministic acceptance condition | Status |
|---:|---|---|---|---|
| RR1 | Separate harness qualification from deployment and declare the protocol-v1 channel set. | harness lifecycle, deployment decision/pointer schemas; state-machine and component contracts | qualification ends at `approved`; `production` is the sole channel; only a deployment pointer represents deployment | complete; static precheck passed |
| RR2 | Remove global rollback state and make rollback a retained-target channel CAS; constrain retirement. | lifecycle/deployment schemas; state-machine contract | no `active`/`rolled_back` lifecycle state; rollback target has manifest and qualification evidence; retirement reference scan is mandatory | complete; static precheck passed |
| RR3 | Add fail-closed abnormal session termination. | session lifecycle and operation-response schemas; session transition table | legal pairs include `nonterminal → terminating → terminated`; reason, revocation, job stop, accounting seal, and final receipt are required | complete; static precheck passed |
| RR4 | Add an isolated raw-trace H3 counterfactual. | baseline matrix; budget config; hypotheses/statistical plan | `B6` and `B6-RAW` differ only in evidence representation and have fixed cost direction, quality endpoints, splits, selector, and failure handling | complete; static precheck passed |
| RR5 | Freeze gate information governance for the complete protocol lifetime. | gate-feedback policy; data-access policy; protocol-manifest schema | method arms, selector, report templates, and analysis are hash-pinned before the sole gate unlock; restricted recipients until finalization | complete; static precheck passed |
| RR6 | Declare gate one-shot semantics and distinguish adaptive feedback from audit retention. | gate-feedback policy; budget/feedback ledgers | one unlock, no replication, zero adaptive candidate feedback, six decision-evidence events maximum, every access recorded | complete; static precheck passed |
| RR7 | Define a deterministic higher-cost exception. | phase-budget ledger; cost-gate and promotion schemas; evaluation budget | signed common-task counts/tokens produce exact integer inequalities; failures and missing usage are charged without discretion | complete; static precheck passed |
| RR8 | Correct and enumerate the fourteen-edge multi-cause graph. | fixture specification; graph instance/schema; split manifest | seven families have degree four overall and degree two in each of two seven-edge strata; IDs equal the unchanged split list | complete; static precheck passed |
| RR9 | Explicitly dispose of H4. | hypotheses, budget config, claim/statistical contracts | exploratory only; second model frozen before outcomes, no retuning/reselection/evolution, or H4 is withdrawn before results | complete; static precheck passed |
| RR10 | Submit only the changed contracts and replacement hashes. | `PACKET_01RR_CONTRACT_CORRECTIONS.md` and exact transport copy | local precheck passes; packet hash is recorded; same exact Architect conversation returns `APPROVE`, `REVISE`, or `BLOCK` | complete; external decision `REVISE`, response hash `d8bec7862e50db073710691ca6464078a34686ea046729ebd420b864df3b7303` |

## Scope lock

Until an explicit Gate 1 `APPROVE`, prohibited work remains:

- runtime, evaluator, isolation, provider-adapter, or benchmark-fixture implementation;
- provider, benchmark, `D_gate`, final-role, temporal-holdout, or withheld-public-test execution;
- promotion, deployment, rollback, or canary execution; and
- performance, security, autonomous-improvement, or cross-model claims.
