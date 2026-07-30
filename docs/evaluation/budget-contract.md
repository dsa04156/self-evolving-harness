# Matched-Budget Contract

Status: Gate 1R structural contract; enumerated numeric fields remain `PILOT_PENDING`

## Two meanings of K

- `K_A = 5`: maximum solver-attempt slots per task in Track A. All solver and meta-agent work also shares
  one equal hard cap vector for B1–B6. B0 deliberately uses one direct slot.
- `K_B = 5`: maximum non-adaptive candidate manifests per evolutionary method in Track B. Each candidate
  receives at most one gate evaluation; no replacement is generated from gate feedback.

The five fixed slot/proposal seeds are `1729`, `271828`, `314159`, `161803`, and `57721`. Final rollout
seed count is separate and selected by the preregistered mine/pilot-only precision rule in the
statistical plan.

## Primary equality rule

For every valid matched comparison, provider/model/parameters, starting harness, tool/policy set,
runtime-state/environment, task commitment, permitted feedback schema, and the complete hard cap vector
are byte-identical. Equal maxima—not forced equal consumption—are required. Realized usage is always
reported.

The authoritative phase and charging rules are in
[phase-budget-ledger.md](phase-budget-ledger.md). They include failed, cancelled, cached, reasoning,
retry, judge, subagent, and background calls. Unused resources expire and cannot move between phases,
tasks, candidates, seeds, methods, or tracks.

## Track separation

Track A measures how a common task-time search envelope is spent and supports test-time-scaling claims.
Track B measures a frozen reusable artifact: mine-only generation, one gate selection, then one
no-retry/no-reflection/no-mutation solver trajectory per final task and rollout seed.

Evolution cost and final per-task cost are separate. Static B0 is a performance/cost anchor with zero
evolution cost, not an equal-development-budget arm.

## Pilot-pending fields

Only these fields may be filled from dedicated pilot or mine-only data before any gate/final observation:

- exact provider, model ID/revision/service tier, parameters, and reproducibility tier;
- per-call/rollout token cap `T`;
- per-phase and total provider-call/token/tool/feedback/time/process/CPU/memory/output caps;
- environment/toolchain/container digests;
- final rollout seed count chosen by the frozen precision rule;
- candidate performance and H3 non-inferiority margins justified by pilot variance/task resolution;
- second model identity for H4.

Gate 3 fills these fields once, creates a content-addressed `ProtocolManifest`, and tags `protocol-v1`.
Changing any field afterward creates a new protocol and excludes earlier runs from confirmatory pooling.
