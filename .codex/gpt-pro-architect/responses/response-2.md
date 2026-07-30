DECISION: REVISE

NOVELTY:
No accepted novelty topic is reopened. The packet reports a standalone runtime that owns its execution and evolution paths rather than delegating them to an existing coding harness. That is consistent with the approved systems-contribution boundary.

Gate 2 does not establish empirical novelty, superiority, or self-improvement, nor does it need to. The current failure is implementation conformance and trust enforcement, not novelty viability.

CORRECTNESS:
The packet demonstrates substantial deterministic implementation: the task loop, evidence chain, bounded mutation, external evaluation, qualification, promotion decisions, and deployment-pointer transitions are exercised by a passing local suite.

It does not yet conform fully to the approved contract.

The component identity implementation uses an unstated two-stage identity rule to avoid a real hash fixed point. That may be a sensible rule, but a sensible undocumented exception is still an exception. The schema and prose must define exactly which fields produce the intrinsic closure-node ID, what the behavior closure contains, and which final fields produce the manifest ID.

Capability validation is also not self-contained. A digest commits to some capability preimage, but the manifest does not identify the authoritative preimage object from which an independent validator must reconstruct that digest.

Cancellation currently prevents a late tool result from winning the session race, but it does not stop the tool itself. For shell and filesystem tools, “we ignored the result” is not equivalent to “the process stopped modifying things.”

Retirement holds and crash-resumable termination/evaluator transactions were explicitly part of the approved Gate 2 scope and remain incomplete. These are correctness blockers, not future polish.

REPRODUCIBILITY:
The pinned environment versions, artifact hashes, schema compilation, build result, deterministic demo, test totals, and coverage report are useful evidence.

They do not cure four reproducibility defects:

The contract and implementation use different component-identity semantics.

Capability digest preimages are not manifest-resolvable.

The TypeScript and Python sides do not implement the same full accepted canonicalization domain.

A Git tree hash omits untracked content that may still exist in the candidate worktree.

A recorded dirty status is evidence that extra bytes existed. It is not an identity for those bytes. Exact-composition evaluation requires either rejecting them or hashing and mounting them as part of the committed snapshot.

The matched-budget scheduler and pilot numeric freeze are not required to pass this runtime-and-trust gate because no empirical evolution experiment is authorized. They remain mandatory before any such experiment.

SECURITY:
Gate 2 fails the frozen security acceptance boundary.

The controller, runtime, and evaluator use the same host UID. Bubblewrap isolation under one principal may reduce accidental access, but the packet itself labels it isolation_emulated and acknowledges that the controller can potentially reach evaluator key paths. That directly contradicts the approved requirement for distinct enforced principal identities and exclusive secret access.

The evaluator path also does not use the accepted authenticated Unix-socket boundary with peer-credential verification. Envelope signatures and replay checks implemented inside a same-principal launch path do not prove independent evaluator identity. A process checking a claimed role supplied by another process is not the same thing as the operating system proving who connected.

Incomplete tool cancellation is also a security defect. A canceled or terminated session must not leave a shell process, descendant, or backend action alive with workspace, secret, or network authority.

Incomplete recovery for termination and evaluator transactions means a crash can leave authority, accounting, lifecycle state, or result commitment in an unresolved state. Those transactions must be restart-safe and idempotent before the trust machinery can be accepted.

CLAIM DISCIPLINE:
The packet correctly discloses all ten gaps and explicitly rejects treating the passing suite as proof of containment, security, deployment readiness, empirical improvement, or self-evolution.

That claim discipline is accepted. The decision remains REVISE because several disclosed gaps violate non-waivable Gate 2 contracts, not because the packet overstates the result.

BLOCKING FINDINGS:

Gap 1, principal isolation: Runtime, controller, and evaluator share one host UID. This fails the accepted real OS-principal boundary and leaves evaluator keys potentially accessible to the controller. Distinct namespaces without distinct enforced identity and secret ownership are insufficient.

Gap 2, actual transport boundary: The evaluator integration does not traverse the required dedicated authenticated Unix socket with peer-credential verification. Testing envelope utilities separately does not prove the real evaluator path enforces sender identity, framing, replay, deadline, role, and key separation.

Gap 3, component fixed point: The implementation derives a closure-node ID from identity - behaviorClosure and then derives a final ID from the complete identity, while the approved contract does not define that two-stage rule. The implementation therefore cannot be said to conform to the frozen identity contract.

Gap 4, capability preimage: capabilityDigest lacks a manifest-bound canonical preimage or content-addressed preimage reference. An independent validator cannot derive the authoritative capability set from the manifest alone, distinguish a missing preimage from an empty set, or prove that the registry supplied the unique intended preimage.

Gap 5, lifecycle and recovery: Retirement-reference holds and process-crash recovery for active termination and evaluator transactions are not complete end to end. Both were explicit Gate 2 obligations.

Gap 7, tool cancellation: Abort propagation stops at the model boundary. Tool processes and their descendants can continue after cancellation or termination, potentially producing uncommitted side effects even when their late result is ignored.

Gap 8, evaluator canonicalization: The evaluator canonicalizer does not implement the complete accepted RFC 8785 numeric domain. A valid protocol object can therefore have different signed or hashed bytes across the TypeScript and Python trust domains unless the protocol is explicitly narrowed.

Gap 9, worktree snapshot identity: The Git tree hash excludes untracked content, while the packet does not state that all untracked and ignored material is rejected before evaluator mounting. Status logging alone does not bind that content into candidate identity.

DEFERRABLE FINDINGS:

Gap 6, complete session-definition signature: This is deferrable for Gate 2 as described because the lifecycle pins are signed and the definition is append-hash protected. Before Gate 3, the project must either sign the complete initial session definition or provide a mechanical field-coverage proof showing that every authority-bearing and result-interpreting field is already committed by a signed manifest, snapshot, or initialization record. No trusted decision may depend solely on an unsigned field.

Gap 10, matched-budget scheduler and pilot numeric freeze: This is deferrable until Gate 3. It becomes blocking before any B0–B6 empirical comparison, pilot calibration, benchmark evolution, gate unlock, performance claim, or self-improvement claim. The absence of a scheduler is not grounds to reject deterministic Gate 2 runtime machinery, but it certainly prevents pretending the evaluation protocol has been executed.

MINIMUM ORDERED CORRECTIONS:

Correct and version the component identity contract. Define separate, named hash domains such as an intrinsic or closure-node ID and the final ComponentManifest ID. Specify exactly which fields each hash covers, whether the component’s own intrinsic ID appears in its behavior closure, how dependency IDs are ordered, and how both values are recomputed. Update the schemas, validators, manifests, fixtures, and affected hashes together.

Make the capability preimage authoritative and content-bound. Place the canonical sorted capability IDs directly in the immutable manifest or add a manifest-declared content-addressed capabilitySetRef. Validation must reject missing, duplicate, noncanonical, digest-mismatched, or type-registry-exceeding capability sets. A side entry discoverable only by registry convention is not sufficient.

Resolve cross-language canonicalization before relying on signatures across the boundary. Either implement the accepted RFC 8785 behavior on both TypeScript and Python sides, including the complete permitted number domain, or version the protocol to a mechanically restricted canonical subset and reject all values outside it. Add a shared cross-language golden corpus and negative cases demonstrating byte-for-byte equality.

Instantiate real principal and key separation. Run every role exercised as an independent trust principal under the accepted contract, at minimum controller/operations, runtime, evaluator, promoter, and audit authority where those roles participate. Use distinct host UIDs or equivalently enforced identities, separately owned credentials, inaccessible key mounts, denied-by-default mounts and network, and fresh namespaces. Tests must prove unauthorized reads, writes, signaling, socket access, and secret access fail at the OS boundary.

Move the real evaluator integration onto the authenticated socket protocol. The production test path must use the dedicated Unix socket, verify peer credentials against the expected principal, perform framing and schema checks, authenticate signatures and roles, enforce nonce/sequence/replay/deadline rules, and fail closed on partial frames, crash, mismatch, and downgrade. The controller must not be able to read or substitute the evaluator signing key.

Make tool cancellation enforceable. Propagate cancellation into the tool executor and all spawned process groups or equivalent containment units. On cancellation, deadline expiry, security termination, or budget exhaustion, revoke authority, terminate and reap descendants, prevent further workspace commits, seal accounting, and reject late outputs. Include a deliberately non-cooperative tool/process test rather than only a cooperative promise to exit.

Complete persistent lifecycle and transaction recovery. Implement retirement-reference holds for deployed targets, rollback targets, live session and descendant pins, pending evaluations, and pending deployment decisions. Implement restart-safe, idempotent recovery for abnormal-termination and evaluator transactions, including crashes before and after result creation, append, signature verification, accounting seal, and final lifecycle transition. Duplicate or contradictory completion must fail.

Bind the exact evaluator filesystem input. Before candidate commitment and evaluator launch, either reject every untracked, ignored, out-of-closure, symlinked, or otherwise uncommitted filesystem object, or construct a separate content-addressed complete snapshot that includes it. The evaluator must receive only the verified committed snapshot or manifest closure. Git status may remain diagnostic but cannot substitute for identity.

Repeat Gate 2 evidence on the corrected path. Re-run build, schema validation, deterministic runtime/evolution tests, cross-language canonicalization tests, actual socket integration, distinct-principal adversarial tests, cancellation/reaping tests, crash-recovery tests, retirement-hold tests, and dirty-worktree rejection or snapshot tests from one clean commit. Report replacement hashes and distinguish unit emulation from tests that actually cross the OS trust boundary.

AUTHORIZED NEXT SCOPE:
Only the minimum correction set above and its deterministic verification are authorized.

The project may revise the component identity and capability contracts, canonicalization implementation or explicitly versioned canonical domain, OS-principal layout, key custody, Unix-socket evaluator path, cancellation and process-reaping behavior, lifecycle holds, crash recovery, worktree snapshot enforcement, schemas, validators, tests, and associated documentation and hashes.

Real-provider smoke remains blocked until the entire blocking correction set passes and Gate 2 is resubmitted and approved. Completion of the corrections does not itself authorize a provider call; a subsequent Architect ruling must grant that scope. This is particularly non-waivable while principal identity, evaluator key custody, accounting, tool cancellation, and cross-language signature bytes remain unresolved.

No benchmark, D_gate, final, temporal, or withheld-public access is authorized. No paid-provider work, live deployment, push, release, performance claim, security claim, generalization claim, or empirical self-improvement claim is authorized.
