use std::collections::BTreeMap;

use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArtifactReference {
    pub content_hash: String,
    pub media_type: String,
    pub size_bytes: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ComponentReference {
    pub component_id: String,
    pub component_manifest_id: String,
    pub type_entry_id: String,
    pub semantic_version: String,
    pub manifest_hash: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TypeRegistryReference {
    pub type_registry_id: String,
    pub type_registry_hash: String,
    pub type_entry_id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BehaviorClosure {
    pub closure_hash: String,
    pub component_count: u64,
    pub artifact_count: u64,
    pub canonical_bytes: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ComponentPayloadReference {
    pub language: String,
    pub artifact: ArtifactReference,
    pub capability_ids: Vec<String>,
    pub capability_digest: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ComponentDependency {
    pub relation: String,
    pub component: ComponentReference,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ComponentIdentity {
    pub canonicalization_profile: String,
    pub component_intrinsic_id: String,
    pub component_id: String,
    pub semantic_version: String,
    pub type_registry_ref: TypeRegistryReference,
    pub payload: ComponentPayloadReference,
    pub dependencies: Vec<ComponentDependency>,
    pub behavior_closure: BehaviorClosure,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ComponentManifest {
    pub schema_version: u64,
    pub component_manifest_id: String,
    pub identity: ComponentIdentity,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ComponentEntry {
    pub component_manifest: ComponentManifest,
    pub payload: Value,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ComponentBinding {
    pub slot_id: String,
    pub component: ComponentReference,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HarnessIdentity {
    pub canonicalization_profile: String,
    pub semantic_version: String,
    pub required_runtime_contract_hash: String,
    pub type_registry_id: String,
    pub component_bindings: Vec<ComponentBinding>,
    pub behavior_closure: BehaviorClosure,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HarnessManifest {
    pub schema_version: u64,
    pub harness_version_id: String,
    pub manifest_hash: String,
    pub identity: HarnessIdentity,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuntimeBinding {
    pub integration_version: String,
    pub upstream_commit: String,
    pub model: String,
    pub model_provider: String,
    pub approval_policy: String,
    pub sandbox_policy: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum BundleSource {
    Bootstrap,
    Promoted,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HarnessBundle {
    pub schema_version: u64,
    pub runtime_track: String,
    pub runtime_binding_hash: String,
    pub runtime_binding: RuntimeBinding,
    pub source: BundleSource,
    pub harness_manifest: HarnessManifest,
    pub component_entries: Vec<ComponentEntry>,
    pub bundle_hash: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PinSelection {
    Current,
    Inherited,
    Resumed,
    LegacyCurrent,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HarnessPin {
    pub schema_version: u64,
    pub runtime_track: String,
    pub thread_id: String,
    pub inherited_from_thread_id: Option<String>,
    pub harness_version_id: String,
    pub harness_manifest_hash: String,
    pub harness_closure_hash: String,
    pub runtime_binding_hash: String,
    pub bundle_hash: String,
    pub selection: PinSelection,
    pub pin_hash: String,
}

impl HarnessPin {
    pub fn extension_attributes(&self) -> BTreeMap<String, String> {
        BTreeMap::from([
            ("seh.bundle_hash".to_string(), self.bundle_hash.clone()),
            (
                "seh.harness_closure_hash".to_string(),
                self.harness_closure_hash.clone(),
            ),
            (
                "seh.harness_version_id".to_string(),
                self.harness_version_id.clone(),
            ),
            ("seh.pin_hash".to_string(), self.pin_hash.clone()),
            ("seh.runtime_track".to_string(), self.runtime_track.clone()),
        ])
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PinRequest {
    pub thread_id: String,
    pub parent_thread_id: Option<String>,
    pub forked_from_thread_id: Option<String>,
    pub resumed: bool,
    pub is_subagent: bool,
    pub runtime_binding: RuntimeBinding,
    pub base_instructions: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolvedHarness {
    pub pin: HarnessPin,
    pub instructions: String,
}
