# Gate 1RRR Narrow Contract-Correction Checklist

Status: **LOCAL CORRECTIONS COMPLETE — EXTERNAL DECISION PENDING**
Source decision: `.codex/gpt-pro-architect/responses/response-1rr.md`
Source response SHA-256:
`d8bec7862e50db073710691ca6464078a34686ea046729ebd420b864df3b7303`
Decision: `REVISE`
Protocol candidate remains: `draft-1`

This checklist is limited to the three corrections authorized by the Gate 1RR decision. Accepted H3
control, gate governance, candidate-cost formula, multi-cause graph, H4 disposition, and all other
accepted Gate 1 topics are unchanged and not reopened.

| ID | Required correction | Primary artifact(s) | Deterministic acceptance condition | Status |
|---:|---|---|---|---|
| RRR1 | Define the full post-rollback pointer tuple. | deployment decision/pointer schemas; state-machine contract; static cross-object precheck | `new.target = prior.rollbackTarget`; `new.rollbackTarget = prior.target`; decision and record contain the same complete before/after state; repeated rollback swaps deterministically | complete; static precheck passed |
| RRR2 | Replace the undefined composition-equivalent anchor with one executable initialization predicate. | deployment decision/pointer schemas; state-machine contract; static precheck | initialization has one approved target and a null rollback target; rollback before the first successful deploy is rejected | complete; static precheck passed |
| RRR3 | Bind abnormal termination records into one immutable transaction. | session lifecycle schema; state-machine contract; static cross-record precheck | final record directly references the initiator, repeats the descriptor and cause byte-for-byte, preserves origin/principal, permits only completion additions, and rejects duplicate/conflicting finals | complete; static precheck passed |
| RRR4 | Submit only these corrections and replacement hashes to the existing Architect conversation. | `PACKET_01RRR_NARROW_CONTRACT_CORRECTIONS.md` and exact transport copy | local precheck passes; exact tab reuse is proven; packet is sent once; response is archived byte-exactly | pending |

## Scope lock

Until an explicit Gate 1 `APPROVE`, prohibited work remains:

- runtime, evaluator, isolation, provider-adapter, promotion, deployment, rollback, benchmark-fixture,
  or canary implementation;
- provider, benchmark, `D_gate`, final-role, temporal-holdout, or withheld-public-test execution; and
- performance, security, deployment-readiness, or autonomous-improvement claims.
