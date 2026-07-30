DECISION: REVISE

CORRECTNESS:
The qualification lifecycle is now correctly separated from deployment, active and rolled_back are removed from global harness state, retirement preserves historical artifacts, and abnormal session termination is explicitly modeled. Two deployment-pointer transitions remain under-specified. First, composition-equivalent rollback anchor has no mechanical equivalence predicate. Second, a rollback identifies the new target but not the rollback target stored in the resulting pointer. The latter leaves repeated rollback behavior undefined. The session termination records also need one cross-record continuity invariant so that the initiating and final records cannot report different termination causes.

EVALUATION FAIRNESS:
B6-RAW is now a valid counterfactual for H3. It holds source evidence, clustering, models, search slots, grammar, attribution workflow, selector, and failure treatment constant while varying evidence representation. The cost interval direction and quality conditions are explicit, and failure of pilot calibration correctly makes H3 exploratory rather than inviting a ceremonial widening of thresholds. The one-shot gate policy closes the prior cross-run adaptation problem. The candidate-cost inequalities correctly implement the stated smoothed cost and efficiency ratios. No remaining evaluation-fairness blocker is present in this correction packet.

GENERALIZATION:
The gate becomes exploratory after release and cannot be rehabilitated merely by assigning a fresh protocol ID, which is the correct rule. H4 is now explicitly exploratory, freezes model-2 conditions before Track B outcomes, prohibits re-evolution and retuning, and requires withdrawal before results if the complete contract cannot be frozen. No remaining generalization blocker is present.

REPRODUCIBILITY:
The corrected fourteen-edge graph is internally consistent. Each of the seven combined balance families has degree two in each stratum and degree four overall, with seven medium and seven high edges. Keeping the split-manifest hash unchanged is coherent because the task IDs and memberships did not change. The integer candidate-cost formula is independently recomputable from signed ledger inputs. The replacement hashes provide artifact identity, although their contents still require executable Gate 2 validation as already planned. The only remaining reproducibility defects are the deployment and termination ambiguities identified below.

SECURITY:
The abnormal termination contract now requires lease and capability revocation, process reaping, sealed accounting, and a final evidence receipt before terminated. An out-of-band kill invalidating the result is also correct. However, the two-record termination transaction does not explicitly require the terminated record to preserve the reason and identity of the preceding terminating record. Without that invariant, an audit trail could begin as process_crash and finish as security_violation, or vice versa, while remaining individually schema-valid. Humans have invented enough opportunities for contradictory logs already.

CLAIM DISCIPLINE:
The packet remains appropriately narrow. It does not claim implementation correctness, actual containment, empirical improvement, gate performance, transfer, or deployment readiness. H3 and H4 are explicitly degradable to exploratory or withdrawable claims. No claim-discipline blocker remains.

BLOCKING FINDINGS:

DeploymentPointerRecord does not define the complete post-state of a rollback. Given a current pointer (target=A, rollbackTarget=B), the packet requires the next target to be B but never states whether the resulting rollback target is A, remains B, becomes the initialization anchor, or is null. Revise the rollback rule to define the entire resulting tuple mechanically. For example, if swap semantics are intended:
new.target = prior.rollbackTarget and
new.rollbackTarget = prior.target.
The schema and cross-object validator must enforce whichever single rule is selected.

The initialize requirement for a “separately approved, composition-equivalent rollback anchor” is not executable because composition-equivalent is undefined. Revise the contract to choose exactly one of these forms:

self-anchor: rollbackTargetHarnessId == targetHarnessId;

null anchor: no rollback target until the first successful deploy, with rollback prohibited beforehand; or

distinct anchor: define equivalence through exact field equality, such as protocol ID, runtime-contract ID, type-registry ID, canonical slot bindings, capability digest, and full behavior-closure hash.
If a distinct manifest is allowed despite equal behavior closure, state which identity-bearing fields may differ and whether the same harness may have separate qualification decisions.

SessionLifecycleRecord does not bind terminating → terminated into one immutable termination transaction. Add a terminationTransactionId or mandatory initiating-record reference and require:

terminated.reason == terminating.reason;

the original pre-termination state and initiating principal remain unchanged;

the final record directly references the initiating record;

only completion evidence, revocation/reaping status, sealed accounting references, and final receipt references may be added;

duplicate or conflicting terminal records fail validation.

AUTHORIZED NEXT SCOPE:
Only the three narrow contract corrections above are authorized: the full post-rollback pointer tuple, the exact initialization-anchor predicate, and cross-record termination-transaction continuity. Update only the affected deployment pointer/decision schema, session lifecycle schema, state-machine contract, corresponding validator cases, replacement hashes, and static precheck. The accepted H3 control, gate governance, candidate-cost formula, multi-cause graph, H4 disposition, and all previously accepted Gate 1 topics are not reopened. Gate 2 runtime, evaluator, isolation, promotion, rollback, benchmark, or provider implementation remains unauthorized until these corrections receive approval.
