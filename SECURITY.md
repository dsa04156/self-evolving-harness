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
- no secret-bearing private signing key persisted in evidence

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

## Trusted computing base and non-claims

The development process isolation assumes the host kernel, root, namespace/bootstrap code, and
protocol-author authority are trusted. It does not claim containment against host root or kernel
compromise. The current public evidence is `publicDevelopment=true` and
`authorizedForResearchEvidence=false`; it is not a security certification, independent benchmark,
promotion authorization, or self-improvement result.

No real-provider secret is required for deterministic verification. If a real provider smoke is
later authorized, credentials must enter only through the local environment/provider proxy, be
redacted from events, and never be committed.
