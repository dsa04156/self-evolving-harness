# Self-Evolving Harness

This repository is an early, standalone coding-agent harness. It owns its model-provider interface,
agent loop, context construction, tools, filesystem memory, skills, sessions, permissions, evidence,
verification, and a separately governed harness-evolution lifecycle. Codex, Gajae-Code, and OpenCode
are prior art and comparison targets, not execution backends.

The project separates two lifecycles:

```text
Task Execution Loop
context → model → tool → result → verification → complete or retry

Harness Evolution Loop
many traces → weakness mining → attribution → bounded mutation
→ new HarnessVersion → held-in/held-out evaluation → promote, reject, or rollback
```

A task retry never creates a `HarnessVersion` and is not called evolution.

## Current status

The deterministic no-provider runtime and a development-only evolution-boundary prototype exist.
The prototype uses eight separate Linux principals for attribution, commitment, scoring, proposing,
quarantine, runtime execution, evaluation, and audit. It proves development plumbing only.

All artifacts published through commit
`a5d82564cece5ecb776a27c86512c3ec56f32787` are permanently classified as
`publicDevelopment=true`. For all of them and every copied or transitive derivative,
`authorizedForResearchEvidence=false`, held-out/sealed/gate/final eligibility is false, and promotion
is unauthorized. They are diagnostic development artifacts, not independent evaluation evidence.

No API key is stored in this repository. No real provider call, B0–B6 experiment, sealed-test access,
promotion, deployment, or self-improvement claim is represented by the current public evidence.

## Verify locally

Requirements are pinned in `package.json` (Node 24.18.1 and npm 11.18.0).

```bash
npm ci
npm run check
npm run build
npm test
npm run verify:development-process-boundary
npm run verify:publication-governance
```

The publication verifier reconstructs the exact public Git tree, verifies the signed deviation,
exposure ledger and append-only remediation closure, reruns the secret scan, and exercises the
anti-laundering policy.

## Repository map

- `src/runtime/`: independent task runtime and tools
- `src/evolution/`: candidate construction and evaluation mechanics
- `src/governance/`: immutable boundaries, taint and public-exposure policy
- `src/evidence/`: signed receipts and append-only evidence
- `schemas/`: closed JSON Schema contracts
- `test/`: deterministic fake-provider and fake-tool tests
- `docs/architecture/`: detailed architecture and lifecycle definitions
- `docs/research/`: exact-SHA prior-art ledger and gap analysis
- `governance/`: signed deviation, exposure, and remediation records
- `architect/`: external Architect review packets and development-only evidence

See [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md),
[REPRODUCIBILITY.md](REPRODUCIBILITY.md), [LIMITATIONS.md](LIMITATIONS.md), and
[NEGATIVE_RESULTS.md](NEGATIVE_RESULTS.md).
