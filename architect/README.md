# Architect Gates

The architect is an external reviewer and decision gate, not an implementation agent or evaluator.

| Gate | Packet | Allows after approval |
|---|---|---|
| 1 | `PACKET_01_RESEARCH_AND_ARCHITECTURE.md` | accept ADR and begin deterministic runtime implementation |
| 2 | `PACKET_02_RUNTIME_AND_TRUST.md` | begin approved live-provider smoke preparation |
| 3 | `PACKET_03_EVOLUTION_AND_PROTOCOL.md` | freeze `protocol-v1` and unlock one final-test run |
| Final | `PACKET_04_FINAL_EVIDENCE.md` | approve only claims supported by sealed evidence |

Development remediation rounds between the numbered gates are incremental and do not silently unlock
the next gate:

| Round | Packet | Status |
|---|---|---|
| 03RRR | `PACKET_03RRR_DEVELOPMENT_ATTRIBUTION_AND_DRY_RUN.md` | approved for development plumbing only |
| 03RRRR | `PACKET_03RRRR_PROCESS_BOUNDARY_AND_RUNTIME_EVIDENCE.md` | REVISE: technical boundary accepted; publication governance correction required |
| 03RRRRR | `PACKET_03RRRRR_PUBLICATION_GOVERNANCE_CLOSURE.md` | REVISE: snapshot policy accepted; historical public-object union required |
| 03RRRRRR | `PACKET_03RRRRRR_HISTORICAL_PUBLICATION_COMPLETENESS.md` | APPROVE: four-root historical publication governance closed |
| 03RRRRRRR | `PACKET_03RRRRRRR_EVALUATOR_VAULT_AND_AUTHORSHIP.md` | REVISE: logical trust contract accepted; durable globally serialized task state required |
| 03RRRRRRRR | `PACKET_03RRRRRRRR_DURABLE_VAULT_STATE.md` | APPROVE: durable globally serialized task-state authority closed |

External transmission, code upload, paid-provider use, and sealed-test access require explicit user
approval at the time of the action. Preparing a local packet does not grant those permissions.

Round 03RRRR authorized one corrective commit and push limited to signed publication-deviation and
closure records, a complete public-exposure ledger, permanent anti-laundering validators and negative
tests, the six factual root-document updates, and a narrow correction packet. It did not authorize a
provider, attribution/scorer/mutation/candidate/evaluator run, B0–B6, sealed data, research selection,
promotion, deployment, release, or empirical claim.

Round 03RRRRRR authorizes only local deterministic evaluator-vault and independent-authorship trust
contracts using synthetic metadata, plus public-history contamination rejections and a narrow
follow-up packet. It does not authorize another push, provider/API use, real gate/final/temporal/
withheld-public task bodies, research execution, selection, promotion, deployment, release, or
empirical claims.

Round 03RRRRRRR authorizes only the local deterministic body-free durable-state correction requested
in its `REVISE`: one authoritative task-state journal, expected-head CAS, cross-process lease/fencing,
commit-before-release, deterministic crash recovery, restart/fresh-request rejection, and a narrow
follow-up packet. It does not authorize a push, provider/API, real task body, research/B0–B6,
selection, promotion, deployment, release, or empirical/security/self-improvement claim.

Round 03RRRRRRRR approves that durable-state correction and authorizes only a local deterministic
body-free OS-principal integration of the accepted authorship and evaluator-vault contracts. It
requires eight distinct subordinate UID/GID roles, role-owned keys and mounts, authenticated
process boundaries, the full commitment-only workflow, and OS-level negative tests. It does not
authorize a push, provider/API, real benchmark material, research/B0–B6, selection, promotion,
deployment, release, publication, or empirical/security/self-improvement claim.

Valid decisions are:

- `APPROVE`: all gate-specific blocking questions are resolved.
- `REVISE`: the project may continue after named contract changes and resubmission.
- `BLOCK`: the claimed contribution or evaluation cannot be repaired within the accepted scope.
