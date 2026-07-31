# Security and trust boundary

This project treats proposer/runtime authority and evaluator/promotion authority as separate domains.
An LLM-generated proposal is untrusted input. It cannot alter immutable policy, evaluator code,
sealed data, budgets, model identity, audit history, or promotion policy.

## Current controls

- closed JSON Schema and canonical content hashes
- Ed25519 principal identities and signed records
- append-only receipts and remediation records
- versioned component and harness identities
- isolated candidate worktrees
- distinct development-process UIDs, keys, mounts, sockets, and zero network/token/tool budgets
- prediction commitment and durable seal before scorer oracle release
- recursive candidate taint and non-promotability
- permanent public-exposure propagation across copies, aliases, dependencies, wrappers, and provenance
- distinct benchmark-author/reviewer/vault/evaluator/scorer/promoter/audit/protocol keys in the
  body-free evaluator-vault contract
- one-time evaluator capability bound to protocol, contract, task commitment, authorship commitment,
  evaluator identity, expiry, and nonce
- vault-signed authoritative CAS task-state/access journal with durable sequence/nonce/capability
  reconstruction, expected global/per-task heads, and zero-release denials
- cross-process owner/epoch lease CAS, acquire/renew fences in the authoritative state journal,
  stale-handle/obsolete-head rejection, and file/directory sync plus committed-head verification before
  release
- no secret-bearing private signing key persisted in evidence
- protocol-author-signed local conformance manifest with an independent aggregate verifier over
  source commits, trees, evidence, rulings, contracts, governance chains, and false authorities

The public repository snapshot was scanned for private-key PEM blocks, live-key shapes, GitHub token
shapes, AWS access-key shapes, and actual `.env` files. No actual secret matched. Variable names and
credential placeholders are not credentials.

## Threats addressed

| Threat | Enforcement |
| --- | --- |
| proposer reads labels before prediction | scorer-only oracle mount and delayed socket |
| role impersonation or receipt forgery | UID peer checks, role keys, signatures |
| commitment/corpus/prediction substitution | exact hash joins and signed seal |
| replay | session/run identities and audit sequence |
| candidate escape into promotion | recursive non-promotable taint |
| public fixture relabeled as sealed | content/Git-blob/alias matching |
| copied candidate used in research | content and provenance propagation |
| laundering through wrapper/dependency | recursive graph traversal |
| protocol bump/history rewrite restores secrecy | permanent reset-denial rules |
| diagnostic result described as independent evaluation | claim-table use class is denied |
| unreviewed/contaminated task admitted | signed assignment/commit/blind/include flow and historical-union check |
| wrong vault role/key/protocol/capability | exact frozen principal and commitment binding |
| denial leaks handle/body/result | fixed zero-field denial projection and unchanged state |
| exact retry or obsolete transition after restart | exact committed disposition reuse plus reconstruction of sequence, nonce, capability, task, evaluation, and score state |
| concurrent/stale vault writer | durable lease epoch, expected-head CAS, stale-handle rejection, and commit-before-release |

## Trusted computing base and non-claims

The development process isolation assumes the host kernel, root, namespace/bootstrap code, and
protocol-author authority are trusted. It does not claim containment against host root or kernel
compromise. The current public evidence is `publicDevelopment=true` and
`authorizedForResearchEvidence=false`; it is not a security certification, independent benchmark,
promotion authorization, or self-improvement result.

The evaluator-vault result is contract-level only. No real task body is present. Body-free task state,
two-process lease contention, stale-epoch recovery, eight-principal role mounts, one-time synthetic
materialization, and crash boundaries are exercised. A fixed inert payload is not evidence of
confidentiality for a real benchmark body.

The local conformance signature is tamper-evident evidence under the repository, protocol-author, host,
Git object database, and key-generation TCB. It does not turn a self-contained repository into an
external trust anchor and is not a security certification.

No real-provider secret is required for deterministic verification. If a real provider smoke is
later authorized, credentials must enter only through the local environment/provider proxy, be
redacted from events, and never be committed.
