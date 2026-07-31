DECISION: APPROVE

PRINCIPAL_AND_KEY_SEPARATION:
The accepted principal, key, mount, and action-authority contract is preserved.

This correction does not provide fresh distinct-UID enforcement evidence, and it does not claim to. The child processes share the local development UID and test cross-process filesystem serialization only. That is sufficient for the narrow durable-state correction because the prior principal model was not reopened.

Actual OS enforcement of the body-free vault workflow remains a later integration obligation.

INDEPENDENT_AUTHORSHIP:
The accepted assignment, author commitment, blinded review, reviewer decision, and vault-finalized transition chain is unchanged.

No raw handle, author identity, task body, verifier logic, label, or path is introduced by the durability correction. The reviewer remains limited to the body-free review projection, and vault admission still requires the exact signed included transition and its predecessor chain.

CONTAMINATION_BOUNDARY:
The accepted historical-publication contamination boundary is unchanged.

Published development artifacts remain permanently ineligible for held-out, sealed, temporal, gate, final, confirmatory, research-selection, promotion, research-evidence, and claim-table use. The durable journal does not create a new path around content, Git-object, alias, dependency, wrapper, or provenance taint.

VAULT_ADMISSION:
Vault admission remains correctly constrained to the previously verified included authorship transition.

The new state journal does not independently admit tasks or invent opaque handles. Every task transition remains bound to:

protocol ID
contract ID and hash
opaque-handle commitment
included authorship-transition hash

Rejected, detached, invented, or contaminated authorship records therefore remain outside vault state.

CAPABILITY_AND_STATE_MACHINE:
The durable-state blocker is closed.

The vault_state_cas_journal is now the sole task-state and access-decision authority. The lease journal coordinates writers but does not project task state. VaultWriterFenceRecord establishes the resource-side writer epoch, while only VaultStateTransitionRecord may preserve or advance:

created → sealed → unlocked → evaluated → scored

Each transition binds both the global predecessor and the exact prior per-task record. Fences may advance the global journal head but cannot silently advance a task. Restart reconstruction recovers task state, capability consumption, accepted sequence and nonce commitments, evaluation and score commitments, and exact-request dispositions from durable records.

The atomic successor rule is adequate. Two writers targeting the same expected sequence and head cannot both publish the final path. The losing writer receives CONFLICT, and there is no implicit rebase. Per-task predecessor checks separately prevent a second valid successor from being attached to the same task state.

The lease and fencing design also closes stale-writer reuse:

lease epochs are monotonic;

renewals, releases, and successor epochs require exact prior lease identity and head;

a transition must directly extend the latest authoritative fence;

a later epoch fence makes an older prepared transition’s expected head obsolete;

inability to establish the exclusive fenced epoch fails closed.

The lease journal is therefore coordination, not a competing source of truth. A lease acquisition alone cannot mutate task state.

ONE_WAY_RELEASE:
Commit-before-release is sufficiently established.

The frozen sequence is:

validate request
→ compute successor
→ append at exact expected head
→ fsync record
→ publish exclusively
→ fsync directory
→ reread committed head
→ reconstruct and verify the complete journal
→ release lease
→ return commitment-only result or stable denial

A capability, evaluation commitment, or score commitment is not released merely because a transition was prepared in memory. It is released only after the authoritative successor has been durably published and verified.

The crash cases after durable commit but before response are handled through exact-request disposition recovery. They do not require a second unlock, evaluation, or score transition.

ACCESS_LEDGER_AND_REPLAY:
The access ledger and state authority are now unified sufficiently for restart and replay handling.

Every first-seen structurally recordable decision is embedded in the same signed transition that either advances or preserves task state. This prevents the prior possibility that access evidence and private in-memory state could disagree after restart.

Exact retries use the canonical full signed-request hash. A byte-identical retry returns the already committed result or the same stable denial without appending a second transition. A fresh request receives normal sequence, nonce, state, capability, and protocol validation and may be durably recorded as a new denial.

The reported restart and adversarial cases close the requested matrix:

fresh second unlock after restart is denied;

fresh second evaluation is denied;

fresh second score is denied;

evaluation from sealed state is denied;

scoring from unlocked state is denied;

obsolete expected heads are denied;

same-head process contention yields one successor;

a third process observes the committed successor;

a killed lease holder is recovered through the next fenced epoch;

response-loss retry returns the committed disposition;

all tested crash boundaries produce one unlock successor.

The abandoned hard-link recovery rule is also sufficiently narrow: only one same-directory staging link to the exact published inode is recoverable, after which the directory is synchronized and the final link count must be one. Ambiguous or external links fail closed.

VALIDATION:
The validation is sufficient for the narrow durable-state correction:

focused vault tests: 11/11 pass
complete deterministic suite: 128/128 pass
build: pass
snapshot publication verifier: pass
historical publication verifier: pass
private-key/live-token scan: zero matches
environment-file scan: zero files
remote push: none

The actual child-process contention, killed-holder recovery, fresh-process reconstruction, crash injection, obsolete-head rejection, and exact-retry tests are materially stronger than the earlier in-process mutex evidence.

The same-development-UID limitation is correctly retained. These tests prove cross-process CAS, journal, lease, and recovery behavior under the stated local filesystem and host TCB. They do not prove fresh OS mount or key isolation.

CLAIM_DISCIPLINE:
The packet maintains the correct boundary.

Approval establishes a deterministic, body-free, durable, globally serialized evaluator-vault state contract under the stated local assumptions. It does not establish:

confidentiality of real benchmark bodies;

production containment;

distributed consistency;

resistance to malicious host root or kernel;

correctness under filesystem loss or vault-key compromise;

provider interoperability;

benchmark validity;

performance, generalization, or self-improvement.

The trusted host clock, filesystem durability, RootlessKit/bubblewrap environment, bootstrapping code, and vault key remain declared TCB assumptions. A live but stalled owner remains an availability concern rather than a secretly solved distributed-systems problem.

BLOCKING_FINDINGS:
None for the narrow durable globally serialized vault-state correction.

AUTHORIZED_NEXT_SCOPE:
The next authorized scope is limited to a local, deterministic, body-free OS-principal integration of the accepted authorship and evaluator-vault contracts.

Authorized work:

Run the frozen roles under distinct subordinate UID/GID principals:

protocol_author
benchmark_author
benchmark_reviewer
vault
evaluator
scorer
promoter
audit_store

Give each role its own key and role-specific mounts. Only the vault principal may write the authoritative state journal and writer-lease journal. Other roles may receive only their contractually permitted commitment projections.

Exercise the complete body-free workflow across authenticated process boundaries:

assignment
→ author commitment
→ blinded review
→ reviewer decision
→ vault admission
→ create
→ seal
→ one-time unlock
→ evaluation commitment
→ score commitment
→ promoter-visible commitment
→ final audit receipt

Use only synthetic metadata, opaque handle commitments, and schema-fixed body-absence fields. Keep:

bodyPresent=false
verifierLogicPresent=false
labelsPresent=false
pathsPresent=false
bodyAccess=none_in_body_free_contract_prototype

Exercise the durable CAS journal and lease protocol under the actual vault principal, including:

two vault process instances contending under one vault role;

restart reconstruction;

lease expiry and next-epoch fencing;

stale writer rejection;

crashes before and after durable transition publication;

response loss and exact retry;

denied wrong-role, wrong-key, replay, substitution, early-access, and protocol-mismatch requests.

Prove through OS-level tests that:

the reviewer cannot mount author identity or raw handle material;

the evaluator cannot mount oracle, score, promoter, or audit authority;

the scorer cannot unlock or evaluate;

the promoter receives only the score commitment and has no vault write capability;

the protocol author cannot read vault task state merely by authoring the contract;

wrong principals cannot read role keys, write journals, replace sockets, signal protected roles, or open prohibited network paths.

Preserve the historical-publication ledger and contamination rules unchanged. Any synthetic metadata reachable from published development material must remain development-only and ineligible for held-out or research use.

Produce a narrow follow-up packet containing:

the actual principal and mapped-host UID matrix;

key ownership and mount matrix;

authenticated transport identities;

durable journal and lease evidence;

crash and contention results;

access-ledger and final audit receipts;

source commit and tree;

exact implementation and evidence hashes; and

explicit confirmation that no task body, provider, research scheduler, promotion, deployment, or empirical result was introduced.

No Git push, API credential request, provider call, real task body, verifier logic, label, path, gate/final/temporal/withheld-public construction or access, research scheduler, B0–B6 execution, pilot, attribution evaluation, candidate selection, qualification, promotion, canary, deployment, production-pointer modification, performance claim, generalization claim, containment claim, security claim, self-improvement claim, release, or publication action is authorized.
