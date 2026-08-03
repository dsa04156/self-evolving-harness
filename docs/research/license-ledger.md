# License Ledger

This ledger is an engineering aid, not legal advice. The implementation policy is clean-room: inspect
interfaces and execution behavior, record citations, then write original code without copying source.

| Source | Artifact | License found | Code reuse allowed by project policy? | Notes |
|---|---|---|---:|---|
| Gajae-Code | source at `8778760…` | MIT | no direct reuse planned | Permissive, but clean-room avoids accidental derivative coupling. |
| Oh My OpenAgent | source at `258fab0…` | Sustainable Use License 1.0 plus third-party licenses | no | Default license restricts commercial use and non-free redistribution; treat as source-available. |
| OxyGent | source at `cd96268…` | Apache-2.0 | no direct reuse planned | Runtime and live-prompt behavior are compared at an exact SHA; implementation remains clean-room. |
| OxyGent paper | arXiv 2604.25602v2 | arXiv non-exclusive distribution license | no | Cite and paraphrase; do not assume a Creative Commons grant. |
| TencentDB-Agent-Memory | source at `f3df793…` | MIT | no direct reuse planned | Layered memory, recall, skill, proxy, and storage behavior compared at an exact SHA; implementation remains clean-room. |
| OpenAI Codex | source at `6219b7c…` | Apache-2.0 | no direct reuse planned | Concepts/interfaces only; preserve attribution if policy later changes. |
| AHE | source at `faf44bc…` | MIT | no direct reuse planned | Paper and code cited; Agent Debugger is not fully open. |
| AHE paper | arXiv 2604.25850 | CC BY 4.0 | figures/text only with attribution, not needed | Paraphrase and cite. |
| Meta-Harness | source at `44b9942…` | MIT | no direct reuse planned | Research code explicitly has limited testing. |
| Meta-Harness paper | arXiv 2603.28052 | CC BY 4.0 | figures/text only with attribution, not needed | Paraphrase and cite. |
| Self-Harness paper | arXiv 2606.09498v1 | CC BY 4.0 | no source implementation located | Method descriptions are documented-only evidence. |
| Rethinking evaluation paper | arXiv 2607.12227v1 | CC BY 4.0 | paper facts with citation | Exact public split IDs are factual protocol data. |
| Rethinking evaluation code | source at `ffd1ba1…` | no license file found | no | Default copyright applies; do not copy implementation. |
| Lilian Weng article | web article dated 2026-07-04 | no project code license | no | Cite short descriptions and link. |
| Darwin Gödel Machine | source at `a565fd2…` | Apache-2.0 | no direct reuse planned | Includes third-party benchmark integrations; clean-room only. |
| OpenAI API documentation | official web documentation | site terms | no | Implement provider protocol from public interface behavior; do not copy documentation text. |

## Repository policy

1. Do not paste source from any reference repository into this project.
2. Every design borrowed at the conceptual level must be named in related work.
3. Any future vendored dependency requires a separate dependency/license review and lockfile record.
4. Generated benchmark task content must have its own provenance and license field.
5. Absence of a license is treated as “no permission to copy,” not as public domain.
