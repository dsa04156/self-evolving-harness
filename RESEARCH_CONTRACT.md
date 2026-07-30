# Research Contract

Status: **revised preregistration; Gate 1RR pending**
Protocol version: `draft-1`

## Terminology

| Term | Definition | Creates `HarnessVersion`? |
|---|---|---:|
| Retry | Re-run the same task or model step under the same harness after a bounded failure. | No |
| Recovery | Restore an interrupted/invalid session to a legal operational state. | No |
| Reflection | Generate critique or revised task output within the same task budget. | No |
| Memory update | Append an observation or result to persistent memory. | No |
| Adaptation | Ephemeral routing/context choice made during a session. | No |
| Harness mutation | Create a candidate by changing one or more authorized components. | Yes |
| Harness evolution | Mutation plus independent evaluation and recorded approve/reject qualification decision. Deployment/rollback is a separate channel lifecycle. | Yes |
| Meta-evolution | Change the optimizer, mutation algorithm, evaluator, or promotion logic. | Yes, but out of MVP |
| Model training | Change model weights or learned provider state. | No; out of scope |

These labels are enforced in event schemas. `task_retry_scheduled` and `session_recovering` events
must explicitly retain the same harness version. Only the Evolution Control Plane may emit a
candidate-version event.

## Gate order

1. Freeze research scope, source-level prior art, hypotheses, falsification rules, dataset access,
   budgets, architecture, schemas, and threat model.
2. Obtain Architect Gate 1 decision; if `REVISE`, change only authorized contracts and resubmit.
3. Obtain explicit Gate 1 approval after all revision rounds and freeze the implementation ADR.
4. Implement deterministic runtime/evolution tests without a live provider.
5. Obtain Architect Gate 2 decision.
6. With separate user approval, run a bounded live-provider smoke test.
7. Pilot only on mine/dedicated-pilot data, validate the non-adaptive gate protocol without final access,
   then obtain Gate 3 and freeze `protocol-v1`.
8. Run the single preregistered gate batch, freeze selected artifacts, unlock final roles once, run final
   experiments, and obtain the final evidence gate.

No final-test result may be used to alter the harness, budget, evaluator, hypothesis, threshold,
or reporting method.

## External-action policy

The user granted blanket authorization for the planned external review, provider smoke/pilot, repository
operations, and publication workflow on 2026-07-30. That authorization does not override the gates,
budgets, data roles, or trust boundaries. The following remain impossible before their protocol phase:

- runtime/provider execution before Gate 1/2 authorization;
- gate/final access before the corresponding signed phase capability;
- external publication of performance/security claims before the final evidence gate.

External Architect packets remain redacted: no secrets, raw private traces, sealed task content, or
unnecessary source upload.

## Evidence discipline

Each prior-art entry records repository/URL, branch, commit SHA, access date, file/section,
observed fact, separate inference, implementation status, and license. Readme claims are not
treated as implementation evidence unless a corresponding code path is traced.

Runtime evidence has three physically and logically separate classes:

1. recorded observations with producer/origin trust emitted by authenticated code;
2. verifier outcomes emitted by a fixed evaluator;
3. LLM/rule-based inferences, including causal attribution and mutation predictions.

Inference cannot satisfy a completion or qualification gate. Every inference must name source event
IDs, producer identity, confidence, and at least one alternative explanation.

## Data access

- `D_mine`: visible to weakness mining and proposer.
- `D_gate`: one-shot per protocol and visible only to evaluator/promoter/audit until all final work is
  irrevocably complete. A later human release makes it exploratory and forces a fresh gate for any new
  confirmatory protocol.
- HFB final: sealed only under independent authorship/vault conditions; otherwise developer-withheld.
- Terminal-Bench final: withheld public test with explicit pretraining/prior-exposure contamination risk.
- Temporal holdout: created or collected after protocol freeze and used only for final replication.

The evaluator runs as a separate principal with read-only benchmark access. The proposer has
write access only to its candidate worktree and proposal output channel.

## Protocol amendments

Any change to a protocol-pinned schema, type registry, runtime/evaluator, hypotheses, splits, fixture
semantics, thresholds, budgets, model/environment, permission/safety, trace/audit/promotion policy,
baseline/statistical plan, or report-selection rule creates a new content-addressed protocol ID. Earlier
experiments cannot be mixed into confirmatory evidence for the new protocol.
