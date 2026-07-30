# Local Precheck 01

Status: non-independent self-review; not an Architect decision  
Packet reviewed: `PACKET_01_RESEARCH_AND_ARCHITECTURE.md`  
Recommendation: `READY_FOR_EXTERNAL_REVIEW`, with a default external outcome of `REVISE` unless the
questions below are resolved.

## Dimension assessment

| Dimension | Local assessment | Reason |
|---|---|---|
| Novelty | conditional | The full integration of standalone runtime, typed version graph, epistemic evidence, and immutable promotion boundary appears distinct in inspected paths, but each constituent technique is prior art. |
| Correctness | design-level only | Lifecycles and schemas are explicit; executable invariants do not yet exist. |
| Evaluation fairness | promising, incomplete | Roles and caps are charged, but numeric caps and exact gate-feedback disclosure remain pilot-pending. |
| Generalization | appropriately falsifiable | Mine/gate/test separation is sound in design; no empirical evidence exists. |
| Reproducibility | partial | Exact SHAs, split IDs, hashes, and contracts exist; fixtures/runtime/environment do not. |
| Security | target only | Worktree is correctly excluded as a sandbox, but principal/mount enforcement is not implemented. |
| Claim discipline | pass at Gate 1 | Documents default to negative results and `REVISE/BLOCK`; no performance claim is made. |

## Findings the external reviewer should challenge

1. **Combination novelty may be insufficient.** “All six layers in one runtime” is an integration
   contribution only if enforcement changes measurable failure modes. Gate 2 must test attacks that a
   prompt/directory boundary would fail.
2. **HarnessFaultBench construction bias is unaddressed.** The same authors could design faults around
   the attribution taxonomy and overstate accuracy. Fixture authorship, blinded ground-truth custody,
   and challenge review need a protocol.
3. **Repeated validation can become training.** “No detailed `D_gate` trace” is insufficient without an
   exact aggregate feedback budget and candidate-selection stopping rule.
4. **H1 needs two controls.** Free-form rewrite should be reported both naturally and size-matched;
   otherwise attribution, boundedness, and edit size are confounded.
5. **H3 thresholds are currently judgment calls.** The 20% and non-inferiority margins should be accepted
   explicitly or H3 should be exploratory.
6. **Model identity may be unverifiable.** A provider alias and parameter manifest cannot prove fixed
   weights; the limitation and drift invalidation procedure need implementation.
7. **Schema validity is not semantic validity.** Cross-field equality, DAG closure, canonical hashes,
   transition order, active-pointer CAS, and rollback restoration require independent validators.
8. **Local principal separation can overclaim security.** Gate 2 must state exactly which containment
   property each platform implements and which remains assumed.
9. **Bootstrap rollback semantics are artificial.** The inactive-anchor design avoids an exception but
   may create a semantically meaningless rollback. The reviewer should compare it with a documented
   genesis exception.
10. **Cross-model H4 and MVP provider scope need reconciliation.** A second model at one provider fits the
    current non-goal more cleanly than introducing a second provider.

## Local gate conclusion

Do not begin the accepted runtime implementation until an independent reviewer returns `APPROVE`, or a
`REVISE` response is incorporated and resubmitted. Preparing deterministic schema fixtures would be
safe, but expanding the frozen Python runtime would violate the current gate order.

