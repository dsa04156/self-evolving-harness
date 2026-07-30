# Principal-by-Capability Matrix

Status: Gate 1R design contract

Every principal has a distinct Ed25519 key, protocol-pinned public key, OS identity, container/namespace,
mount table, network policy, secret set, and resource account. A development process that shares an OS
identity is explicitly non-conformant for security evidence.

Abbreviations: `RO` read-only, `RW` read-write, `—` not mounted or unavailable. All writable stores are
further restricted to content-addressed or append-only APIs.

## Enforcement matrix

| Principal | UID / isolation identity | RO mounts | RW mounts | Accepted / emitted messages | Secrets | Network | Host-enforced cap | Sole record authority |
|---|---|---|---|---|---|---|---|---|
| Runtime | ephemeral `seh-runtime-<session>` in fresh task container | exact harness closure, immutable tool/schema/policy set, task-visible input | one workspace overlay, session journal, scoped memory overlay, result staging | accepts session control, provider/tool responses, child results; emits provider/tool requests and runtime event batches | session signing key; opaque provider capability, never provider API key | Unix sockets to operations, tool broker, provider proxy only | task token/tool/time/process/CPU/memory/output and descendant slices | session runtime observations under its own identity |
| Operations owner | `seh-operations` control container | harness/deployment registry, protocol manifest, public keys | session lease/checkpoint/event intake and artifact intake through brokers | accepts operator control and runtime events; emits start/interrupt/resume/recover/finalize/delegation | operations signing key | local authenticated control sockets only | control request rate, lease count, checkpoint bytes | session state transitions, leases, operation receipts |
| Proposer | ephemeral `seh-proposer-<round>` in no-network mutation container | redacted `D_mine` evidence, rejected-proposal memory, type registry, payload schemas, mutable parent closure | candidate staging worktree and proposal output only | accepts mine evidence packet; emits inference, attribution, mutation proposal, staged artifact hashes | proposer signing key; scoped provider capability when model calls are authorized | provider proxy only; no direct Internet or evaluator socket | evolution phase ledger, candidate count, output/artifact bytes, CPU/memory/process/time | inference-class `AttributionResult` and `MutationProposal`; never provenance/evaluation |
| Evaluator | ephemeral `seh-evaluator-<run>` under evaluator UID/container | signed evaluator/verifier, protocol, exact parent/candidate closures, opaque authorized split via private vault | fresh paired workspaces, evaluator result staging | accepts evaluator request; emits verifier receipts and evaluation result | evaluator signing key and one-time opaque task-handle capability | provider proxy only when solver calls are required; no proposer/promoter socket | paired phase ledger, task count, processes, CPU/memory/time/output | `verifier_outcome`, `EvaluationResult`, evaluation receipts |
| Promoter | `seh-promoter` minimal decision container | protocol, promotion policy, lifecycle projection, evaluation/gate/canary results, audit heads, deployment pointer | no filesystem registry write; authenticated CAS request only | accepts promotion request; emits signed decision and deployment CAS request | promoter signing key | local audit and deployment-registry sockets only; no provider | decision count and short wall-clock/CPU limit; zero model calls | `PromotionDecision`; cannot write deployment pointer directly |
| Audit store | `seh-audit` isolated append service | protocol/public keys; its prior log segments | append-only audit segments and signed checkpoints | accepts audit append; emits acknowledgements and verified heads | audit-store signing key; optional external-witness credential | local authenticated sockets; optional pinned witness endpoint only | append size/rate, disk quota | audit sequence assignment, chain record, checkpoint |
| Model-provider proxy | `seh-provider-proxy` isolated egress container | protocol model allowlist and budget accounts | provider request/usage ledger only | accepts scoped provider requests; emits responses and usage records | provider API key, proxy signing key | DNS/IP/TLS allowlist for pinned provider endpoints only | calls/tokens/cost/concurrency/rate/time for all roles | provider usage and charge receipts |
| Benchmark author | separate blinded `seh-benchmark-author` account/environment | preregistered fixture/temporal-task authoring contract; contamination inputs | new task/verifier staging and authorship log | emits candidate-independent task package to protocol author; receives no run result | author signing key; no provider/evaluator/proposer credentials | sources permitted only under documented collection policy; no project result endpoints | task count, collection window, artifact size | authorship and independent-review records; not split activation |
| Protocol author | offline or isolated `seh-protocol-author` account | all reviewed design artifacts, benchmark package, public keys | new protocol staging only | signs protocol/type registry/split freeze; cannot alter an existing protocol | protocol signing key kept outside runtime hosts | none during freeze/signing | one freeze transaction per semantic version | protocol manifest and protocol-supersession record |

## Data mounts by split

| Principal | `D_mine` | `D_gate` | sealed HarnessFaultBench test | withheld public Terminal-Bench test | temporal holdout |
|---|---|---|---|---|---|
| Runtime | task-visible case only when invoked | task-visible case only inside evaluator child | final evaluator child only | final evaluator child only | final evaluator child only |
| Operations owner | opaque handles | opaque handles | no paths/content | no paths/content | no paths/content |
| Proposer | redacted evidence and allowed task content | none; aggregate release only through fixed packet | none | none | none |
| Evaluator | authorized task vault | authorized task vault | final-unlock capability only | final-unlock capability only | final-unlock capability only |
| Promoter | aggregate signed mine/gate results | aggregate signed gate result | none for decisions | none for decisions | none for decisions |
| Audit store | hashes/roles only | hashes/roles only | hashes/roles only | hashes/roles only | hashes/roles only |
| Provider proxy | encrypted/model request content in transit only; no persistent benchmark mount | same | same | same | same |
| Benchmark author | authoring source only | authoring source only | independently reviewed source | public source acknowledged | own blinded task only; no candidate results |

## Record-creation matrix

| Record | Runtime | Ops | Proposer | Evaluator | Promoter | Audit | Provider proxy | Benchmark / protocol author |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `RuntimeEvent` | create runtime-origin observation/inference | control-origin only | no | evaluator-origin only | no | no | usage-origin only | no |
| `EvidenceReceipt` | request | create session/control receipt | no trusted receipt | create evaluator receipt | create decision receipt | seal audit link | create usage receipt | create authorship/freeze receipt |
| `AttributionResult` | no | no | create, always `inference` | no | no | no | no | no |
| `MutationProposal` | no | no | create | no | no | no | no | no |
| component/harness manifest | no | validate/stage through registry | submit untrusted candidate bytes | read/rehash | read | hash only | no | bootstrap/protocol components only |
| provenance/lineage/lifecycle record | no | registry/lifecycle controller | no | no | lifecycle decision trigger only | append/seal | no | bootstrap only |
| `EvaluationResult` | no | no | no | create | no | verify link | no | no |
| `PromotionDecision` | no | no | no | no | create | verify link | no | no |
| `DeploymentPointerRecord` | no | registry service applies CAS | no | no | request only | verify link | no | initialize only under signed bootstrap policy |
| `ProtocolManifest` | no | no | no | no | no | archive | no | protocol author creates/signs |

## Delegation

Delegation only reduces authority. A signed child envelope binds the parent session, principal role,
capability subset, exact harness/protocol/snapshot/model/split/budget IDs, depth, and deadline. The
operations owner and provider proxy reject a child that changes any inherited pin, requests a capability
absent from the parent, or exceeds the immutable maximum depth. A delegated key expires with the child
and cannot sign another principal's record type.
