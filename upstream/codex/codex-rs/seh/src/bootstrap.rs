use std::collections::BTreeMap;

use serde_json::Value;
use serde_json::json;

use crate::Result;
use crate::SehError;
use crate::canonical::canonical_len;
use crate::canonical::content_id;
use crate::canonical::sha256_value;
use crate::model::BehaviorClosure;
use crate::model::BundleSource;
use crate::model::ComponentBinding;
use crate::model::ComponentDependency;
use crate::model::ComponentEntry;
use crate::model::ComponentIdentity;
use crate::model::ComponentManifest;
use crate::model::ComponentPayloadReference;
use crate::model::HarnessBundle;
use crate::model::HarnessIdentity;
use crate::model::HarnessManifest;
use crate::model::RuntimeBinding;
use crate::model::TypeRegistryReference;
use crate::verify::TYPE_REGISTRY_HASH;
use crate::verify::TYPE_REGISTRY_ID;
use crate::verify::artifact;
use crate::verify::bundle_identity_value;
use crate::verify::component_reference;
use crate::verify::expected_component_closure;
use crate::verify::expected_harness_closure;
use crate::verify::verify_bundle;

pub const INTEGRATION_VERSION: &str = "0.1.0";
pub const UPSTREAM_COMMIT: &str = "5af85998c24fb3353ddd8164c3ed472057b03cb3";
const RUNTIME_CONTRACT_HASH: &str =
    "sha256:aab075a85360ddacad802eb2040dff0c6768e9bd5ecf70ad4f88c3eddd9b1805";

pub fn runtime_contract_hash() -> String {
    RUNTIME_CONTRACT_HASH.to_string()
}

struct ComponentSpec {
    slot_id: &'static str,
    component_id: &'static str,
    type_entry_id: &'static str,
    language: &'static str,
    payload: Value,
    capabilities: &'static [&'static str],
    dependency_slots: &'static [&'static str],
}

pub(crate) fn build_bootstrap_bundle(
    runtime_binding: RuntimeBinding,
    base_instructions: &str,
) -> Result<HarnessBundle> {
    let runtime_binding_hash =
        sha256_value(&serde_json::to_value(&runtime_binding).map_err(|error| {
            SehError::Invalid(format!("could not serialize runtime binding: {error}"))
        })?)?;
    let specs = component_specs(&runtime_binding, base_instructions)?;
    let mut entries = Vec::new();
    let mut reference_by_slot = BTreeMap::new();
    for spec in specs {
        let dependencies = spec
            .dependency_slots
            .iter()
            .map(|slot| {
                reference_by_slot.get(*slot).cloned().ok_or_else(|| {
                    SehError::Invalid(format!("component dependency {slot} is late"))
                })
            })
            .collect::<Result<Vec<_>>>()?;
        let entry = build_component(&spec, dependencies, &entries)?;
        reference_by_slot.insert(
            spec.slot_id.to_string(),
            component_reference(&entry.component_manifest)?,
        );
        entries.push(entry);
    }
    entries.sort_by(|left, right| {
        left.component_manifest
            .component_manifest_id
            .cmp(&right.component_manifest.component_manifest_id)
    });

    let component_bindings = reference_by_slot
        .into_iter()
        .map(|(slot_id, component)| ComponentBinding { slot_id, component })
        .collect::<Vec<_>>();
    let roots = component_bindings
        .iter()
        .map(|binding| {
            entries
                .iter()
                .find(|entry| {
                    entry.component_manifest.component_manifest_id
                        == binding.component.component_manifest_id
                })
                .map(|entry| &entry.component_manifest)
                .ok_or_else(|| SehError::Invalid("harness root component is missing".to_string()))
        })
        .collect::<Result<Vec<_>>>()?;
    let behavior_closure = expected_harness_closure(&roots, &entries)?;
    let semantic_suffix = runtime_binding_hash
        .strip_prefix("sha256:")
        .ok_or_else(|| SehError::Invalid("bad runtime binding hash".to_string()))?;
    let identity = HarnessIdentity {
        canonicalization_profile: "seh-c14n-int-v1".to_string(),
        semantic_version: format!("0.1.0+{}", &semantic_suffix[..16]),
        required_runtime_contract_hash: runtime_contract_hash(),
        type_registry_id: TYPE_REGISTRY_ID.to_string(),
        component_bindings,
        behavior_closure,
    };
    let identity_value = serde_json::to_value(&identity)
        .map_err(|error| SehError::Invalid(format!("could not serialize harness: {error}")))?;
    let harness_version_id = content_id("hv-sha256", &identity_value)?;
    let harness_manifest = HarnessManifest {
        schema_version: 2,
        manifest_hash: format!(
            "sha256:{}",
            harness_version_id
                .strip_prefix("hv-sha256:")
                .ok_or_else(|| SehError::Invalid("bad HarnessVersion ID".to_string()))?
        ),
        harness_version_id,
        identity,
    };
    let mut bundle = HarnessBundle {
        schema_version: 1,
        runtime_track: "codex-derived".to_string(),
        runtime_binding_hash,
        runtime_binding,
        source: BundleSource::Bootstrap,
        harness_manifest,
        component_entries: entries,
        bundle_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000"
            .to_string(),
    };
    bundle.bundle_hash = sha256_value(&bundle_identity_value(&bundle)?)?;
    verify_bundle(&bundle)?;
    Ok(bundle)
}

fn build_component(
    spec: &ComponentSpec,
    mut dependency_refs: Vec<crate::model::ComponentReference>,
    existing: &[ComponentEntry],
) -> Result<ComponentEntry> {
    dependency_refs
        .sort_by(|left, right| left.component_manifest_id.cmp(&right.component_manifest_id));
    let dependencies = dependency_refs
        .into_iter()
        .map(|component| ComponentDependency {
            relation: "requires".to_string(),
            component,
        })
        .collect::<Vec<_>>();
    let mut capability_ids = spec
        .capabilities
        .iter()
        .map(|capability| (*capability).to_string())
        .collect::<Vec<_>>();
    capability_ids.sort();
    capability_ids.dedup();
    let payload_hash = sha256_value(&spec.payload)?;
    let payload_size = canonical_len(&spec.payload)?;
    let capability_digest = sha256_value(&json!({ "capabilityIds": capability_ids }))?;
    let version_identity = json!({
        "capabilityIds": capability_ids,
        "dependencies": dependencies,
        "payload": spec.payload,
        "typeEntryId": spec.type_entry_id,
    });
    let version_hash = sha256_value(&version_identity)?;
    let version_suffix = version_hash
        .strip_prefix("sha256:")
        .ok_or_else(|| SehError::Invalid("bad component version hash".to_string()))?;
    let mut identity = ComponentIdentity {
        canonicalization_profile: "seh-c14n-int-v1".to_string(),
        component_intrinsic_id: String::new(),
        component_id: spec.component_id.to_string(),
        semantic_version: format!("0.1.0+{}", &version_suffix[..16]),
        type_registry_ref: TypeRegistryReference {
            type_registry_id: TYPE_REGISTRY_ID.to_string(),
            type_registry_hash: TYPE_REGISTRY_HASH.to_string(),
            type_entry_id: spec.type_entry_id.to_string(),
        },
        payload: ComponentPayloadReference {
            language: spec.language.to_string(),
            artifact: artifact(payload_hash, payload_size),
            capability_ids,
            capability_digest,
        },
        dependencies,
        behavior_closure: empty_closure(),
    };
    let mut intrinsic = serde_json::to_value(&identity)
        .map_err(|error| SehError::Invalid(format!("could not serialize component: {error}")))?;
    let intrinsic_object = intrinsic
        .as_object_mut()
        .ok_or_else(|| SehError::Invalid("component identity is not an object".to_string()))?;
    intrinsic_object.remove("componentIntrinsicId");
    intrinsic_object.remove("behaviorClosure");
    identity.component_intrinsic_id = content_id("ci-sha256", &intrinsic)?;
    let mut manifest = ComponentManifest {
        schema_version: 3,
        component_manifest_id: format!("cm-sha256:{}", "0".repeat(64)),
        identity,
    };
    let mut provisional = existing.to_vec();
    provisional.push(ComponentEntry {
        component_manifest: manifest.clone(),
        payload: spec.payload.clone(),
    });
    manifest.identity.behavior_closure = expected_component_closure(&manifest, &provisional)?;
    manifest.component_manifest_id = content_id(
        "cm-sha256",
        &serde_json::to_value(&manifest.identity).map_err(|error| {
            SehError::Invalid(format!("could not serialize component identity: {error}"))
        })?,
    )?;
    Ok(ComponentEntry {
        component_manifest: manifest,
        payload: spec.payload.clone(),
    })
}

fn empty_closure() -> BehaviorClosure {
    BehaviorClosure {
        closure_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000"
            .to_string(),
        component_count: 1,
        artifact_count: 1,
        canonical_bytes: 1,
    }
}

fn component_specs(
    binding: &RuntimeBinding,
    base_instructions: &str,
) -> Result<Vec<ComponentSpec>> {
    let instructions = if base_instructions.trim().is_empty() {
        "You are the Codex-derived SEH coding agent."
    } else {
        base_instructions
    };
    let runtime_hash = runtime_contract_hash();
    let tool_schema_hash = sha256_value(&json!({
        "catalog": "codex-runtime-tools",
        "contract": runtime_hash,
    }))?;
    let policy = |policy_type: &'static str, value: Value| {
        json!({
            "schemaVersion": 1,
            "language": "seh.policy-json.v1",
            "policyType": policy_type,
            "policy": value,
        })
    };
    let immutable = |kind: &'static str, entrypoint: &'static str| {
        json!({
            "schemaVersion": 1,
            "language": "seh.immutable-artifact.v1",
            "kind": kind,
            "artifact": {
                "contentHash": runtime_hash,
                "mediaType": "application/octet-stream",
                "sizeBytes": 0,
            },
            "entrypoint": entrypoint,
            "toolchainDigest": runtime_hash,
        })
    };
    Ok(vec![
        ComponentSpec {
            slot_id: "tool_implementation.codex-runtime-tools",
            component_id: "codex-derived.tool-implementation.runtime-catalog",
            type_entry_id: "type.tool-implementation",
            language: "seh.immutable-artifact.v1",
            payload: immutable("tool_implementation", "codex/runtime-tools"),
            capabilities: &["tool.execute"],
            dependency_slots: &[],
        },
        ComponentSpec {
            slot_id: "tool_description.codex-runtime-tools",
            component_id: "codex-derived.tool-description.runtime-catalog",
            type_entry_id: "type.tool-description",
            language: "seh.tool-description.v1",
            payload: json!({
                "schemaVersion": 1,
                "language": "seh.tool-description.v1",
                "toolId": "codex.runtime-tools",
                "implementationSchemaHash": tool_schema_hash,
                "summary": "The exact model-facing tool catalog assembled by the Codex runtime.",
                "usageNotes": ["The runtime schema remains authoritative."],
                "parameterDescriptions": [],
            }),
            capabilities: &["tool.describe.existing"],
            dependency_slots: &["tool_implementation.codex-runtime-tools"],
        },
        ComponentSpec {
            slot_id: "system_prompt",
            component_id: "codex-derived.system-prompt",
            type_entry_id: "type.system-prompt",
            language: "seh.prompt-markdown.v1",
            payload: prompt_payload("codex_system", "system_rules", instructions),
            capabilities: &["prompt.instruct.primary"],
            dependency_slots: &[],
        },
        ComponentSpec {
            slot_id: "subagent_prompt",
            component_id: "codex-derived.subagent-prompt",
            type_entry_id: "type.subagent-prompt",
            language: "seh.prompt-markdown.v1",
            payload: prompt_payload(
                "bounded_subagent",
                "subagent_role",
                "{{runtime_subagent_instructions}}\n\nYou are a bounded Codex child agent. Work only on the delegated task, preserve the parent HarnessVersion and permissions, and return evidence to the parent.",
            ),
            capabilities: &["prompt.instruct.subagent"],
            dependency_slots: &[],
        },
        ComponentSpec {
            slot_id: "context_policy",
            component_id: "codex-derived.context-policy",
            type_entry_id: "type.context-policy",
            language: "seh.context-policy.v1",
            payload: context_policy(),
            capabilities: &[
                "context.read.memory",
                "context.read.session",
                "context.read.skills",
                "context.read.task",
                "context.read.tool-catalog",
                "context.read.tool-results",
                "context.read.verification",
            ],
            dependency_slots: &["tool_description.codex-runtime-tools"],
        },
        ComponentSpec {
            slot_id: "memory_retrieval_policy",
            component_id: "codex-derived.memory-retrieval-policy",
            type_entry_id: "type.memory-retrieval-policy",
            language: "seh.memory-retrieval-policy.v1",
            payload: json!({
                "schemaVersion": 2,
                "language": "seh.memory-retrieval-policy.v1",
                "readableNamespaces": ["accepted_lessons", "project_facts", "rejected_mutations", "session_summaries", "user_preferences"],
                "queryMode": "fixed_hybrid",
                "hybridLexicalWeightMicros": 700000,
                "maxRecords": 16,
                "maxTokens": 8192,
                "minimumScoreMicros": 0,
                "tieBreak": "created_at_then_record_id",
            }),
            capabilities: &[
                "memory.read.accepted-lessons",
                "memory.read.project-facts",
                "memory.read.rejected-mutations",
                "memory.read.session-summaries",
                "memory.read.user-preferences",
            ],
            dependency_slots: &[],
        },
        ComponentSpec {
            slot_id: "skill.codex-runtime",
            component_id: "codex-derived.skill.runtime",
            type_entry_id: "type.skill",
            language: "seh.skill.v1",
            payload: json!({
                "schemaVersion": 1,
                "language": "seh.skill.v1",
                "skillId": "codex.runtime",
                "summary": "Use Codex runtime tools and evidence to complete coding tasks safely.",
                "allowedToolIds": ["codex.runtime-tools"],
                "steps": [
                    {"stepId": "inspect", "kind": "evidence_check", "instruction": "Inspect relevant repository evidence before changing files."},
                    {"stepId": "execute", "kind": "tool_guidance", "instruction": "Use the smallest relevant runtime tool action.", "toolId": "codex.runtime-tools"},
                    {"stepId": "verify", "kind": "completion_check", "instruction": "Run proportionate verification and report evidence."}
                ],
                "completionChecks": ["Requested behavior is implemented.", "Relevant verification has passed."],
            }),
            capabilities: &["skill.guide", "skill.reference.existing-tool"],
            dependency_slots: &["tool_description.codex-runtime-tools"],
        },
        ComponentSpec {
            slot_id: "routing_policy",
            component_id: "codex-derived.routing-policy",
            type_entry_id: "type.routing-policy",
            language: "seh.routing-policy.v1",
            payload: json!({
                "schemaVersion": 1,
                "language": "seh.routing-policy.v1",
                "rules": [
                    {"ruleId": "high_risk_primary", "priority": 100, "match": {"taskClass": "code_change", "riskClass": "high"}, "target": {"kind": "primary", "routeId": "codex.primary"}}
                ],
                "defaultTarget": {"kind": "primary", "routeId": "codex.primary"},
            }),
            capabilities: &["routing.select.primary", "routing.select.subagent"],
            dependency_slots: &["subagent_prompt"],
        },
        ComponentSpec {
            slot_id: "workflow_policy",
            component_id: "codex-derived.workflow-policy",
            type_entry_id: "type.workflow-policy",
            language: "seh.workflow.v1",
            payload: workflow_policy(),
            capabilities: &["workflow.dispatch.closed-action"],
            dependency_slots: &["routing_policy", "skill.codex-runtime", "subagent_prompt"],
        },
        ComponentSpec {
            slot_id: "permission_policy",
            component_id: "codex-derived.permission-policy",
            type_entry_id: "type.permission-policy",
            language: "seh.policy-json.v1",
            payload: policy(
                "PermissionPolicy",
                json!({"approvalPolicy": binding.approval_policy, "sandboxPolicyHash": binding.sandbox_policy_hash}),
            ),
            capabilities: &["permission.authorize"],
            dependency_slots: &[],
        },
        ComponentSpec {
            slot_id: "safety_policy",
            component_id: "codex-derived.safety-policy",
            type_entry_id: "type.safety-policy",
            language: "seh.policy-json.v1",
            payload: policy(
                "SafetyPolicy",
                json!({"authority": "codex-sandbox-and-permissions", "candidateMutable": false}),
            ),
            capabilities: &["safety.authorize"],
            dependency_slots: &[],
        },
        ComponentSpec {
            slot_id: "budget_policy",
            component_id: "codex-derived.budget-policy",
            type_entry_id: "type.budget-policy",
            language: "seh.policy-json.v1",
            payload: policy(
                "BudgetPolicy",
                json!({"authority": "immutable-evaluation-contract", "taskRuntimeCaps": "codex-native"}),
            ),
            capabilities: &["budget.enforce"],
            dependency_slots: &[],
        },
        ComponentSpec {
            slot_id: "model_identity",
            component_id: "codex-derived.model-identity",
            type_entry_id: "type.model-identity",
            language: "seh.policy-json.v1",
            payload: policy(
                "ModelIdentity",
                serde_json::to_value(binding)
                    .map_err(|error| SehError::Invalid(error.to_string()))?,
            ),
            capabilities: &["model.invoke.pinned"],
            dependency_slots: &[],
        },
        ComponentSpec {
            slot_id: "verification_policy",
            component_id: "codex-derived.verification-policy",
            type_entry_id: "type.verification-policy",
            language: "seh.policy-json.v1",
            payload: policy(
                "VerificationPolicy",
                json!({"mode": "task-proportionate", "resultsAreObservedFacts": true}),
            ),
            capabilities: &["verification.request"],
            dependency_slots: &[],
        },
        ComponentSpec {
            slot_id: "recovery_policy",
            component_id: "codex-derived.recovery-policy",
            type_entry_id: "type.recovery-policy",
            language: "seh.policy-json.v1",
            payload: policy(
                "RecoveryPolicy",
                json!({"taskRetryIsEvolution": false, "strategy": "verify-classify-recover"}),
            ),
            capabilities: &["recovery.classify", "recovery.resume"],
            dependency_slots: &[],
        },
        ComponentSpec {
            slot_id: "memory_policy",
            component_id: "codex-derived.memory-policy",
            type_entry_id: "type.memory-policy",
            language: "seh.policy-json.v1",
            payload: policy(
                "MemoryPolicy",
                json!({"storage": "filesystem", "memoryIsUntrustedContext": true}),
            ),
            capabilities: &["memory.admin"],
            dependency_slots: &[],
        },
        ComponentSpec {
            slot_id: "subagent_configuration",
            component_id: "codex-derived.subagent-configuration",
            type_entry_id: "type.subagent-configuration",
            language: "seh.policy-json.v1",
            payload: policy(
                "SubagentConfiguration",
                json!({"inheritHarnessVersion": true, "permissionWidening": false}),
            ),
            capabilities: &["subagent.configure"],
            dependency_slots: &["subagent_prompt"],
        },
        ComponentSpec {
            slot_id: "audit_policy",
            component_id: "codex-derived.audit-policy",
            type_entry_id: "type.audit-policy",
            language: "seh.policy-json.v1",
            payload: policy(
                "AuditPolicy",
                json!({"appendOnly": true, "hashChain": "sha256", "candidateMutable": false}),
            ),
            capabilities: &["audit.append", "audit.verify"],
            dependency_slots: &[],
        },
        ComponentSpec {
            slot_id: "promotion_policy",
            component_id: "codex-derived.promotion-policy",
            type_entry_id: "type.promotion-policy",
            language: "seh.policy-json.v1",
            payload: policy(
                "PromotionPolicy",
                json!({"externalEvaluatorRequired": true, "rollbackPointerRequired": true}),
            ),
            capabilities: &["promotion.decide"],
            dependency_slots: &[],
        },
        ComponentSpec {
            slot_id: "benchmark_data",
            component_id: "codex-derived.benchmark-manifest",
            type_entry_id: "type.benchmark-manifest",
            language: "seh.policy-json.v1",
            payload: policy(
                "BenchmarkManifest",
                json!({"sealed": true, "runtimeReadable": false}),
            ),
            capabilities: &["benchmark.identify"],
            dependency_slots: &[],
        },
        ComponentSpec {
            slot_id: "evaluator",
            component_id: "codex-derived.evaluator",
            type_entry_id: "type.evaluator",
            language: "seh.immutable-artifact.v1",
            payload: immutable("evaluator_binary", "seh/evaluator/external-process"),
            capabilities: &["evaluation.read.opaque-task", "evaluation.write.result"],
            dependency_slots: &[],
        },
        ComponentSpec {
            slot_id: "trace_collector",
            component_id: "codex-derived.trace-collector",
            type_entry_id: "type.trace-collector",
            language: "seh.immutable-artifact.v1",
            payload: immutable("trace_collector", "seh/evidence/runtime-event-bridge"),
            capabilities: &["trace.collect"],
            dependency_slots: &[],
        },
        ComponentSpec {
            slot_id: "middleware",
            component_id: "codex-derived.middleware",
            type_entry_id: "type.middleware",
            language: "seh.immutable-artifact.v1",
            payload: immutable("middleware", "seh/runtime/session-binding"),
            capabilities: &["runtime.middleware"],
            dependency_slots: &[],
        },
        ComponentSpec {
            slot_id: "optimizer",
            component_id: "codex-derived.optimizer",
            type_entry_id: "type.optimizer-code",
            language: "seh.immutable-artifact.v1",
            payload: immutable("optimizer", "seh/evolution/bounded-proposer"),
            capabilities: &["optimizer.propose"],
            dependency_slots: &[],
        },
    ])
}

fn prompt_payload(section_id: &str, purpose: &str, content: &str) -> Value {
    json!({
        "schemaVersion": 1,
        "language": "seh.prompt-markdown.v1",
        "sections": [{"sectionId": section_id, "purpose": purpose, "content": content}],
        "contextBindings": ["selected_memory", "selected_skills", "task_input", "tool_catalog", "verification_feedback"],
    })
}

fn context_policy() -> Value {
    json!({
        "schemaVersion": 1,
        "language": "seh.context-policy.v1",
        "totalTokenLimit": 1048576,
        "sources": [
            {"source": "system_prompt", "priority": 1000, "maxTokens": 131072, "selection": "all_in_order"},
            {"source": "task_input", "priority": 900, "maxTokens": 131072, "selection": "all_in_order"},
            {"source": "tool_catalog", "priority": 800, "maxTokens": 131072, "selection": "all_in_order"},
            {"source": "selected_skills", "priority": 700, "maxTokens": 131072, "selection": "deterministic_rank"},
            {"source": "selected_memory", "priority": 600, "maxTokens": 131072, "selection": "deterministic_rank"},
            {"source": "session_events", "priority": 500, "maxTokens": 262144, "selection": "latest_first"},
            {"source": "tool_results", "priority": 400, "maxTokens": 131072, "selection": "latest_first"},
            {"source": "verification_feedback", "priority": 300, "maxTokens": 65536, "selection": "latest_first"}
        ],
        "overflowPolicy": "truncate_oldest_with_receipt",
    })
}

fn workflow_policy() -> Value {
    json!({
        "schemaVersion": 1,
        "language": "seh.workflow.v1",
        "entryState": "execute",
        "states": [
            {"stateId": "execute", "actions": [{"action": "construct_context", "targetId": null}, {"action": "model_turn", "targetId": null}, {"action": "request_tool", "targetId": null}]},
            {"stateId": "validate", "actions": [{"action": "verify", "targetId": null}]},
            {"stateId": "completed", "actions": [{"action": "emit_completion", "targetId": null}]},
            {"stateId": "blocked", "actions": [{"action": "emit_block", "targetId": null}]}
        ],
        "transitions": [
            {"from": "execute", "trigger": "action_succeeded", "guard": "evidence_complete", "to": "validate"},
            {"from": "execute", "trigger": "action_failed", "guard": "no_retry_remaining", "to": "blocked"},
            {"from": "execute", "trigger": "action_failed", "guard": "retry_remaining", "to": "execute"},
            {"from": "validate", "trigger": "verification_passed", "guard": "always", "to": "completed"},
            {"from": "validate", "trigger": "verification_failed", "guard": "retry_remaining", "to": "execute"},
            {"from": "validate", "trigger": "verification_failed", "guard": "no_retry_remaining", "to": "blocked"}
        ],
        "terminalStates": ["blocked", "completed"],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn binding() -> RuntimeBinding {
        RuntimeBinding {
            integration_version: INTEGRATION_VERSION.to_string(),
            upstream_commit: UPSTREAM_COMMIT.to_string(),
            model: "fake-model".to_string(),
            model_provider: "fake-provider".to_string(),
            reasoning_effort: Some("medium".to_string()),
            reasoning_summary: Some("Auto".to_string()),
            service_tier: None,
            collaboration_mode_hash:
                "sha256:1111111111111111111111111111111111111111111111111111111111111111"
                    .to_string(),
            developer_instructions_hash: None,
            compact_prompt_hash: None,
            personality: None,
            dynamic_tools_hash:
                "sha256:2222222222222222222222222222222222222222222222222222222222222222"
                    .to_string(),
            feature_set_hash:
                "sha256:3333333333333333333333333333333333333333333333333333333333333333"
                    .to_string(),
            approval_policy: "never".to_string(),
            sandbox_policy_hash:
                "sha256:4444444444444444444444444444444444444444444444444444444444444444"
                    .to_string(),
        }
    }

    #[test]
    fn bootstrap_bundle_is_deterministic_and_self_verifying() {
        let first = build_bootstrap_bundle(binding(), "Pinned prompt").unwrap();
        let second = build_bootstrap_bundle(binding(), "Pinned prompt").unwrap();
        assert_eq!(first, second);
        verify_bundle(&first).unwrap();
        assert_eq!(first.component_entries.len(), 24);
    }

    #[test]
    fn prompt_change_creates_a_new_harness_version() {
        let first = build_bootstrap_bundle(binding(), "First prompt").unwrap();
        let second = build_bootstrap_bundle(binding(), "Second prompt").unwrap();
        assert_ne!(
            first.harness_manifest.harness_version_id,
            second.harness_manifest.harness_version_id
        );
    }
}
