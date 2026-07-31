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

External transmission, code upload, paid-provider use, and sealed-test access require explicit user
approval at the time of the action. Preparing a local packet does not grant those permissions.

Round 03RRRR authorized one corrective commit and push limited to signed publication-deviation and
closure records, a complete public-exposure ledger, permanent anti-laundering validators and negative
tests, the six factual root-document updates, and a narrow correction packet. It did not authorize a
provider, attribution/scorer/mutation/candidate/evaluator run, B0–B6, sealed data, research selection,
promotion, deployment, release, or empirical claim.

Valid decisions are:

- `APPROVE`: all gate-specific blocking questions are resolved.
- `REVISE`: the project may continue after named contract changes and resubmission.
- `BLOCK`: the claimed contribution or evaluation cannot be repaired within the accepted scope.
