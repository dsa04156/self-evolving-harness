use std::collections::BTreeMap;
use std::collections::BTreeSet;

use serde::Serialize;
use serde_json::Map;
use serde_json::Value;
use serde_json::json;

use crate::Result;
use crate::SehError;
use crate::canonical::canonical_len;
use crate::canonical::content_id;
use crate::canonical::sha256_value;
use crate::model::ArtifactReference;
use crate::model::BehaviorClosure;
use crate::model::ComponentEntry;
use crate::model::ComponentManifest;
use crate::model::ComponentReference;
use crate::model::HarnessBundle;
use crate::model::HarnessPin;

pub(crate) const TYPE_REGISTRY_ID: &str =
    "ctr-sha256:93d1ce4068c4b12a2a35a51d673fbd64b6b1dfba6d024b9ae8b937010852403c";
pub(crate) const TYPE_REGISTRY_HASH: &str =
    "sha256:93d1ce4068c4b12a2a35a51d673fbd64b6b1dfba6d024b9ae8b937010852403c";

struct Closure {
    document: Value,
    canonical_bytes: u64,
    component_count: u64,
    artifact_count: u64,
}

pub fn verify_bundle(bundle: &HarnessBundle) -> Result<()> {
    require(bundle.schema_version == 1, "unsupported bundle schema")?;
    require(
        bundle.runtime_track == "codex-derived",
        "runtime track must be codex-derived",
    )?;
    require(
        bundle.runtime_binding_hash == sha256_serialized(&bundle.runtime_binding)?,
        "runtime binding hash mismatch",
    )?;
    require(
        bundle
            .harness_manifest
            .identity
            .required_runtime_contract_hash
            == crate::bootstrap::runtime_contract_hash(),
        "runtime contract hash mismatch",
    )?;
    require(
        bundle.harness_manifest.identity.type_registry_id == TYPE_REGISTRY_ID,
        "component type registry mismatch",
    )?;

    let entries = component_map(&bundle.component_entries)?;
    for entry in &bundle.component_entries {
        verify_component(entry, &entries)?;
    }
    verify_harness(bundle, &entries)?;
    require(
        bundle.bundle_hash == sha256_value(&bundle_identity_value(bundle)?)?,
        "bundle hash mismatch",
    )?;
    Ok(())
}

pub(crate) fn verify_pin(pin: &HarnessPin) -> Result<()> {
    require(pin.schema_version == 1, "unsupported pin schema")?;
    require(
        pin.runtime_track == "codex-derived",
        "pin runtime track mismatch",
    )?;
    require(
        pin.pin_hash == sha256_value(&pin_identity_value(pin)?)?,
        "pin hash mismatch",
    )
}

pub(crate) fn bundle_identity_value(bundle: &HarnessBundle) -> Result<Value> {
    let mut value = object_value(bundle)?;
    value.remove("bundleHash");
    Ok(Value::Object(value))
}

pub(crate) fn pin_identity_value(pin: &HarnessPin) -> Result<Value> {
    let mut value = object_value(pin)?;
    value.remove("pinHash");
    Ok(Value::Object(value))
}

pub(crate) fn instructions_for(bundle: &HarnessBundle, is_subagent: bool) -> Result<String> {
    let slot = if is_subagent {
        "subagent_prompt"
    } else {
        "system_prompt"
    };
    let binding = bundle
        .harness_manifest
        .identity
        .component_bindings
        .iter()
        .find(|binding| binding.slot_id == slot)
        .ok_or_else(|| SehError::Invalid(format!("harness is missing {slot}")))?;
    let entry = bundle
        .component_entries
        .iter()
        .find(|entry| {
            entry.component_manifest.component_manifest_id
                == binding.component.component_manifest_id
        })
        .ok_or_else(|| SehError::Invalid(format!("component for {slot} is missing")))?;
    let sections = entry
        .payload
        .get("sections")
        .and_then(Value::as_array)
        .ok_or_else(|| SehError::Invalid(format!("{slot} has no prompt sections")))?;
    let contents = sections
        .iter()
        .map(|section| {
            section
                .get("content")
                .and_then(Value::as_str)
                .filter(|content| !content.is_empty())
                .ok_or_else(|| SehError::Invalid(format!("{slot} contains an empty section")))
        })
        .collect::<Result<Vec<_>>>()?;
    require(!contents.is_empty(), &format!("{slot} is empty"))?;
    Ok(contents.join("\n\n"))
}

pub(crate) fn expected_component_closure(
    manifest: &ComponentManifest,
    entries: &[ComponentEntry],
) -> Result<BehaviorClosure> {
    let map = entries
        .iter()
        .map(|entry| {
            (
                entry.component_manifest.component_manifest_id.clone(),
                entry,
            )
        })
        .collect::<BTreeMap<_, _>>();
    behavior_closure(closure_for(&[manifest], &map)?)
}

pub(crate) fn expected_harness_closure(
    roots: &[&ComponentManifest],
    entries: &[ComponentEntry],
) -> Result<BehaviorClosure> {
    let map = entries
        .iter()
        .map(|entry| {
            (
                entry.component_manifest.component_manifest_id.clone(),
                entry,
            )
        })
        .collect::<BTreeMap<_, _>>();
    behavior_closure(closure_for(roots, &map)?)
}

fn component_map(entries: &[ComponentEntry]) -> Result<BTreeMap<String, &ComponentEntry>> {
    let mut result = BTreeMap::new();
    for entry in entries {
        let id = &entry.component_manifest.component_manifest_id;
        require(
            result.insert(id.clone(), entry).is_none(),
            "duplicate component manifest",
        )?;
    }
    let actual = entries
        .iter()
        .map(|entry| entry.component_manifest.component_manifest_id.as_str())
        .collect::<Vec<_>>();
    let mut sorted = actual.clone();
    sorted.sort_unstable();
    require(actual == sorted, "component entries are not sorted")?;
    Ok(result)
}

fn verify_component(
    entry: &ComponentEntry,
    entries: &BTreeMap<String, &ComponentEntry>,
) -> Result<()> {
    let manifest = &entry.component_manifest;
    require(manifest.schema_version == 3, "unsupported component schema")?;
    require(
        manifest.identity.canonicalization_profile == "seh-c14n-int-v1",
        "component canonicalization profile mismatch",
    )?;
    require(
        manifest.identity.type_registry_ref.type_registry_id == TYPE_REGISTRY_ID
            && manifest.identity.type_registry_ref.type_registry_hash == TYPE_REGISTRY_HASH,
        "component type registry reference mismatch",
    )?;
    require_hash(&manifest.component_manifest_id, "cm-sha256")?;
    require_hash(&manifest.identity.component_intrinsic_id, "ci-sha256")?;

    let payload_value = serialized_value(&manifest.identity.payload)?;
    let expected_capability_digest = sha256_value(&json!({
        "capabilityIds": manifest.identity.payload.capability_ids
    }))?;
    require(
        manifest.identity.payload.capability_digest == expected_capability_digest,
        "component capability digest mismatch",
    )?;
    let capabilities = &manifest.identity.payload.capability_ids;
    require_sorted_unique(capabilities, "component capabilities")?;
    require(
        manifest.identity.payload.artifact.content_hash == sha256_value(&entry.payload)?,
        "component payload hash mismatch",
    )?;
    require(
        manifest.identity.payload.artifact.size_bytes == canonical_len(&entry.payload)?,
        "component payload size mismatch",
    )?;
    require(
        manifest.identity.payload.artifact.media_type == "application/json",
        "component payload media type mismatch",
    )?;
    let _ = payload_value;

    let intrinsic = intrinsic_identity_value(manifest)?;
    require(
        manifest.identity.component_intrinsic_id == content_id("ci-sha256", &intrinsic)?,
        "component intrinsic identity mismatch",
    )?;
    require(
        manifest.component_manifest_id
            == content_id("cm-sha256", &serialized_value(&manifest.identity)?)?,
        "component manifest identity mismatch",
    )?;
    require_dependencies_resolve(manifest, entries)?;
    let closure = closure_for(&[manifest], entries)?;
    require_closure(&manifest.identity.behavior_closure, &closure, "component")
}

fn verify_harness(
    bundle: &HarnessBundle,
    entries: &BTreeMap<String, &ComponentEntry>,
) -> Result<()> {
    let manifest = &bundle.harness_manifest;
    require(
        manifest.schema_version == 2,
        "unsupported HarnessVersion schema",
    )?;
    require(
        manifest.identity.canonicalization_profile == "seh-c14n-int-v1",
        "harness canonicalization profile mismatch",
    )?;
    let expected_id = content_id("hv-sha256", &serialized_value(&manifest.identity)?)?;
    require(
        manifest.harness_version_id == expected_id,
        "HarnessVersion identity mismatch",
    )?;
    require(
        manifest.manifest_hash
            == format!(
                "sha256:{}",
                expected_id
                    .strip_prefix("hv-sha256:")
                    .ok_or_else(|| SehError::Invalid("bad HarnessVersion ID".to_string()))?
            ),
        "HarnessVersion manifest hash mismatch",
    )?;

    let slots = manifest
        .identity
        .component_bindings
        .iter()
        .map(|binding| binding.slot_id.clone())
        .collect::<Vec<_>>();
    require_sorted_unique(&slots, "harness slots")?;
    let mut roots = Vec::new();
    for binding in &manifest.identity.component_bindings {
        let entry = entries
            .get(&binding.component.component_manifest_id)
            .ok_or_else(|| SehError::Invalid(format!("missing slot {}", binding.slot_id)))?;
        require(
            binding.component == component_reference(&entry.component_manifest)?,
            "harness component reference mismatch",
        )?;
        roots.push(&entry.component_manifest);
    }
    let closure = closure_for(&roots, entries)?;
    require_closure(&manifest.identity.behavior_closure, &closure, "harness")
}

fn require_dependencies_resolve(
    manifest: &ComponentManifest,
    entries: &BTreeMap<String, &ComponentEntry>,
) -> Result<()> {
    let ids = manifest
        .identity
        .dependencies
        .iter()
        .map(|dependency| dependency.component.component_manifest_id.clone())
        .collect::<Vec<_>>();
    require_sorted_unique(&ids, "component dependencies")?;
    for dependency in &manifest.identity.dependencies {
        require(
            dependency.relation == "requires",
            "unsupported dependency relation",
        )?;
        let resolved = entries
            .get(&dependency.component.component_manifest_id)
            .ok_or_else(|| SehError::Invalid("component dependency is missing".to_string()))?;
        require(
            dependency.component == component_reference(&resolved.component_manifest)?,
            "component dependency reference mismatch",
        )?;
    }
    Ok(())
}

fn closure_for(
    roots: &[&ComponentManifest],
    entries: &BTreeMap<String, &ComponentEntry>,
) -> Result<Closure> {
    let mut selected = BTreeMap::new();
    let mut visiting = BTreeSet::new();
    for root in roots {
        visit(root, entries, &mut selected, &mut visiting)?;
    }
    let mut components = selected
        .values()
        .map(|manifest| {
            let mut dependency_ids = manifest
                .identity
                .dependencies
                .iter()
                .map(|dependency| {
                    entries
                        .get(&dependency.component.component_manifest_id)
                        .map(|entry| {
                            entry
                                .component_manifest
                                .identity
                                .component_intrinsic_id
                                .clone()
                        })
                        .ok_or_else(|| SehError::Invalid("missing closure dependency".to_string()))
                })
                .collect::<Result<Vec<_>>>()?;
            dependency_ids.sort();
            Ok(json!({
                "componentIntrinsicId": manifest.identity.component_intrinsic_id,
                "identityHash": sha256_value(&intrinsic_identity_value(manifest)?)?,
                "payloadHash": manifest.identity.payload.artifact.content_hash,
                "dependencyIntrinsicIds": dependency_ids,
            }))
        })
        .collect::<Result<Vec<_>>>()?;
    components.sort_by(|left, right| {
        left["componentIntrinsicId"]
            .as_str()
            .cmp(&right["componentIntrinsicId"].as_str())
    });
    let mut artifacts = selected
        .values()
        .map(|manifest| manifest.identity.payload.artifact.clone())
        .collect::<Vec<_>>();
    artifacts.sort_by(|left, right| left.content_hash.cmp(&right.content_hash));
    artifacts.dedup_by(|left, right| left.content_hash == right.content_hash);
    let document = json!({
        "profile": "seh-c14n-int-v1",
        "components": components,
        "artifacts": artifacts,
    });
    let canonical_bytes = canonical_len(&document)?
        + artifacts
            .iter()
            .map(|artifact| artifact.size_bytes)
            .sum::<u64>();
    Ok(Closure {
        document,
        canonical_bytes,
        component_count: selected.len() as u64,
        artifact_count: artifacts.len() as u64,
    })
}

fn visit<'a>(
    manifest: &'a ComponentManifest,
    entries: &BTreeMap<String, &'a ComponentEntry>,
    selected: &mut BTreeMap<String, &'a ComponentManifest>,
    visiting: &mut BTreeSet<String>,
) -> Result<()> {
    if selected.contains_key(&manifest.component_manifest_id) {
        return Ok(());
    }
    require(
        visiting.insert(manifest.component_manifest_id.clone()),
        "component dependency cycle",
    )?;
    for dependency in &manifest.identity.dependencies {
        let entry = entries
            .get(&dependency.component.component_manifest_id)
            .ok_or_else(|| SehError::Invalid("component dependency is missing".to_string()))?;
        visit(&entry.component_manifest, entries, selected, visiting)?;
    }
    visiting.remove(&manifest.component_manifest_id);
    selected.insert(manifest.component_manifest_id.clone(), manifest);
    Ok(())
}

fn require_closure(actual: &BehaviorClosure, expected: &Closure, label: &str) -> Result<()> {
    require(
        actual.closure_hash == sha256_value(&expected.document)?
            && actual.component_count == expected.component_count
            && actual.artifact_count == expected.artifact_count
            && actual.canonical_bytes == expected.canonical_bytes,
        &format!("{label} behavior closure mismatch"),
    )
}

fn behavior_closure(closure: Closure) -> Result<BehaviorClosure> {
    Ok(BehaviorClosure {
        closure_hash: sha256_value(&closure.document)?,
        component_count: closure.component_count,
        artifact_count: closure.artifact_count,
        canonical_bytes: closure.canonical_bytes,
    })
}

fn intrinsic_identity_value(manifest: &ComponentManifest) -> Result<Value> {
    let mut identity = object_value(&manifest.identity)?;
    identity.remove("componentIntrinsicId");
    identity.remove("behaviorClosure");
    Ok(Value::Object(identity))
}

pub(crate) fn component_reference(manifest: &ComponentManifest) -> Result<ComponentReference> {
    let digest = manifest
        .component_manifest_id
        .strip_prefix("cm-sha256:")
        .ok_or_else(|| SehError::Invalid("bad component manifest ID".to_string()))?;
    Ok(ComponentReference {
        component_id: manifest.identity.component_id.clone(),
        component_manifest_id: manifest.component_manifest_id.clone(),
        type_entry_id: manifest.identity.type_registry_ref.type_entry_id.clone(),
        semantic_version: manifest.identity.semantic_version.clone(),
        manifest_hash: format!("sha256:{digest}"),
    })
}

fn serialized_value<T: Serialize>(value: &T) -> Result<Value> {
    serde_json::to_value(value).map_err(|error| SehError::Invalid(error.to_string()))
}

fn object_value<T: Serialize>(value: &T) -> Result<Map<String, Value>> {
    serialized_value(value)?
        .as_object()
        .cloned()
        .ok_or_else(|| SehError::Invalid("expected a JSON object".to_string()))
}

fn sha256_serialized<T: Serialize>(value: &T) -> Result<String> {
    sha256_value(&serialized_value(value)?)
}

fn require_hash(value: &str, prefix: &str) -> Result<()> {
    let digest = value
        .strip_prefix(&format!("{prefix}:"))
        .filter(|digest| digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or_else(|| SehError::Invalid(format!("invalid {prefix} identifier")))?;
    require(
        digest.bytes().all(|byte| !byte.is_ascii_uppercase()),
        "hash is not lowercase",
    )
}

fn require_sorted_unique(values: &[String], label: &str) -> Result<()> {
    let mut sorted = values.to_vec();
    sorted.sort();
    sorted.dedup();
    require(
        values == sorted,
        &format!("{label} are not sorted and unique"),
    )
}

fn require(condition: bool, message: &str) -> Result<()> {
    if condition {
        Ok(())
    } else {
        Err(SehError::Integrity(message.to_string()))
    }
}

pub(crate) fn artifact(content_hash: String, size_bytes: u64) -> ArtifactReference {
    ArtifactReference {
        content_hash,
        media_type: "application/json".to_string(),
        size_bytes,
    }
}
