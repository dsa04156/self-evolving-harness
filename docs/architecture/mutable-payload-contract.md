# MVP Mutable Payload Contract

Status: Gate 2R canonical-profile correction

The MVP mutation surface is data, not code. Every candidate-controlled byte must use the
`seh-c14n-int-v1` canonical JSON profile and conform to one pinned schema, except text fields inside
that JSON, which also follow the text normalization contract. Fractional quantities are represented by
named fixed-scale integers.

## Allowed languages

| Component type | Language | Contract |
|---|---|---|
| `SystemPrompt`, `SubagentPrompt` | `seh.prompt-markdown.v1` | ordered, typed prompt sections and a closed set of context bindings |
| `ContextPolicy` | `seh.context-policy.v1` | fixed context sources, priorities, token limits, and overflow modes |
| `MemoryRetrievalPolicy` | `seh.memory-retrieval-policy.v1` | fixed namespaces and deterministic retrieval/ranking parameters |
| `Skill` | `seh.skill.v1` | finite model-guidance steps, allowed existing tool IDs, and completion checks |
| `WorkflowPolicy` | `seh.workflow.v1` | finite states, closed actions/triggers/guards, and bounded transitions |
| `RoutingPolicy` | `seh.routing-policy.v1` | finite exact-class rules and existing route IDs |
| `ToolDescription` | `seh.tool-description.v1` | model-facing prose tied to an immutable implementation-schema hash |

No MVP candidate may submit `seh.immutable-artifact.v1`, generic policy JSON, raw filesystem trees, or
another language. Conditionally mutable classes have no enabled condition in protocol v1.

## Globally forbidden constructs

Candidate admission rejects:

- source code, bytecode, native objects, WebAssembly, scripts, macros, expression evaluators, templates
  with executable interpolation, or embedded interpreters;
- imports, package coordinates, build/install hooks, dynamic libraries, plugin registration, tool
  registration, middleware, event hooks, or evaluator callbacks;
- HTTP(S), Git, SSH, package-registry, data-URL, environment-variable, host-path, or mutable object-store
  references;
- filesystem includes, external file indirection, symbolic/hard links, archive members, compression,
  base64/hex encoded expansion, or encrypted/obfuscated payloads;
- shell fragments or tool argument templates in skills and workflows;
- regex, arbitrary predicates, arbitrary expressions, user-defined guards, unbounded recursion, dynamic
  state creation, or unbounded code/content generation;
- a tool description whose immutable implementation-schema hash or tool ID does not match its bound
  `ToolImplementation`;
- undeclared dependencies, capabilities, context sources, memory namespaces, tools, routes, skills, or
  subagent targets.

Prompt prose can discuss code because coding tasks require it, but prose has no authority to add a tool,
mount, secret, network destination, evaluator input, budget, or permission. Runtime enforcement ignores
authority claims in mutable text.

## Capability model

The type registry gives each component type a maximum capability set. The validator derives the
effective set from the parsed payload and its bound immutable resources. The immutable component
manifest carries that exact sorted set as `payload.capabilityIds` and hashes
`{"capabilityIds": [...]}` into `capabilityDigest`. Missing, duplicate, unsorted, digest-mismatched, or
registry-exceeding sets are rejected; no registry-log side entry can supply the preimage.

For protocol v1:

- candidate capability additions are forbidden;
- removal is allowed and recorded;
- reordering, prioritization, selection, and prose changes inside the parent's existing capability set
  are allowed when the payload schema permits them;
- a route, tool, memory namespace, context source, skill, or subagent target absent from the parent
  effective set cannot be introduced by mutation;
- permissions remain the intersection of immutable policy, runtime principal capability, session grant,
  and tool-specific schema; mutable payloads never widen that intersection.

Semantic change records include both capability-set deltas and normalized operations such as
`route.priority.changed`, `context.source.limit.changed`, or `workflow.transition.retargeted`.

## Workflow execution bounds

The workflow DSL has no code evaluator. The runtime dispatches closed action IDs through immutable
handlers. All IDs resolve before candidate admission.

- maximum states: 32;
- maximum transitions: 128;
- maximum actions per state: 16;
- transition guards use only the five enumerated predicates;
- cycle traversal is bounded by the immutable task budget and runtime workflow-hop cap;
- `spawn_subagent` and `wait_job` inherit the parent session pins and cannot select a new harness;
- `request_tool` is still checked by the immutable registry, input schema, permission policy, and sandbox.

## Skill execution bounds

A skill is context supplied to the model, not an executable package. It cannot carry scripts, assets,
sub-skills, install steps, argument templates, or file references. A `tool_guidance` step may name only a
tool already present in both the parent skill capability set and immutable tool registry. The actual call
is a normal model tool request and passes every runtime permission check.

## Tool-description non-authority

The runtime sends a mutable description together with the immutable machine input schema. It labels the
schema authoritative. Before dispatch, the executor ignores the mutable description and validates the
request against the immutable schema and permission policy. A misleading description can reduce task
performance but cannot change executor behavior or authority.

## Validation pipeline

1. validate canonical bytes and media type;
2. validate JSON Schema against the protocol-pinned payload schema digest;
3. recursively scan all strings and keys for forbidden external/encoded constructs;
4. resolve every ID against the parent harness and immutable registries;
5. derive and compare effective capabilities and `capabilityDigest`;
6. build a finite workflow/routing graph; reject missing nodes, duplicate IDs, ambiguous equal-priority
   rules, unreachable terminal states, and unbounded dispatch paths;
7. recompute complete dependency closure and mutation metrics;
8. run adversarial payload tests in a no-network, read-only parser process;
9. emit a trusted static-validation receipt or reject before evaluation.

The parser process has no provider credential, shell, compiler, package manager, network, writeable
runtime tree, evaluator secret, or benchmark mount.
