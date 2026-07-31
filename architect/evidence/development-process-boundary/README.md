# Development Process-Boundary Evidence

This directory contains development-only evidence for the process boundary
authorized after Architect Gate 03RRR. It is not benchmark, promotion, canary,
deployment, or self-improvement evidence.

The bundle demonstrates eight distinct subordinate UIDs and role-specific
Ed25519 keys for attribution, prediction commitment, scoring, mutation
proposal, candidate quarantine, runtime execution, candidate evaluation, and
audit. The scorer socket is absent until an audit-signed prediction commitment
is durably sealed. Only the scorer receives the visible-fixture oracle mount.

The candidate is a permanently non-promotable development artifact. Its
parent/candidate outcomes are derived from actual standalone runtime execution
with a deterministic request-observing fake provider and immutable tools.

Regenerate and verify:

```bash
npm run generate:development-process-boundary
npm run verify:development-process-boundary
```

Generation requires `newuidmap`, `newgidmap`, RootlessKit, bubblewrap, and the
pinned local Python 3.13 runtime used by the OS-boundary tests.
