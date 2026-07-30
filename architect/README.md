# Architect Gates

The architect is an external reviewer and decision gate, not an implementation agent or evaluator.

| Gate | Packet | Allows after approval |
|---|---|---|
| 1 | `PACKET_01_RESEARCH_AND_ARCHITECTURE.md` | accept ADR and begin deterministic runtime implementation |
| 2 | `PACKET_02_RUNTIME_AND_TRUST.md` | begin approved live-provider smoke preparation |
| 3 | `PACKET_03_EVOLUTION_AND_PROTOCOL.md` | freeze `protocol-v1` and unlock one final-test run |
| Final | `PACKET_04_FINAL_EVIDENCE.md` | approve only claims supported by sealed evidence |

External transmission, code upload, paid-provider use, and sealed-test access require explicit user
approval at the time of the action. Preparing a local packet does not grant those permissions.

Valid decisions are:

- `APPROVE`: all gate-specific blocking questions are resolved.
- `REVISE`: the project may continue after named contract changes and resubmission.
- `BLOCK`: the claimed contribution or evaluation cannot be repaired within the accepted scope.

