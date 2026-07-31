# MVP Non-Goals

The MVP intentionally does not include:

- model-weight updates, fine-tuning, or reinforcement learning;
- self-modification of optimizer/proposer/evaluator code;
- automatic mutation of tool implementations or middleware;
- simultaneous support for multiple live providers;
- compatibility adapters for Codex, Gajae-Code, or OpenCode;
- using `codex exec`, a Codex login token, a ChatGPT browser session, or Codex CLI internals as the
  new harness's model-provider backend;
- requiring a paid live-provider call to build or deterministically verify the standalone MVP;
- a GUI, IDE extension, browser automation layer, or MCP ecosystem;
- a vector database or learned retrieval index;
- cloud-distributed scheduling or multi-tenant control plane;
- unrestricted whole-repository rewriting as the proposed method;
- access by the proposer to sealed tasks, evaluator internals, promotion policy, or audit storage;
- claims of general, recursive, open-ended, or AGI-level self-improvement.

Free-form whole-harness rewrite remains an experimental baseline, executed only in an isolated
candidate area under the same budget and immutable evaluation boundary.
