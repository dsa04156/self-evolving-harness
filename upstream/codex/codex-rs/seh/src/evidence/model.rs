use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrincipalIdentity {
    pub principal_id: String,
    pub role: String,
    pub identity_digest: String,
    pub implementation_digest: String,
    pub instance_id: String,
    pub model_identity_hash: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EventOrigin {
    pub origin_class: String,
    pub origin_id: String,
    pub trust_level: String,
}

impl EventOrigin {
    pub(crate) fn runtime(origin_id: impl Into<String>) -> Self {
        Self {
            origin_class: "runtime".to_string(),
            origin_id: origin_id.into(),
            trust_level: "authenticated_principal".to_string(),
        }
    }

    pub(crate) fn provider(origin_id: impl Into<String>) -> Self {
        Self {
            origin_class: "provider".to_string(),
            origin_id: origin_id.into(),
            trust_level: "authenticated_principal".to_string(),
        }
    }

    pub(crate) fn tool(origin_id: impl Into<String>) -> Self {
        Self {
            origin_class: "tool".to_string(),
            origin_id: origin_id.into(),
            trust_level: "sandbox_observation".to_string(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RedactionRecord {
    pub contains_known_secrets: bool,
    pub applied_rule_ids: Vec<String>,
    pub scanner_hash: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuntimeEvent {
    pub schema_version: u64,
    pub event_id: String,
    pub protocol_id: String,
    pub session_id: String,
    pub harness_version_id: String,
    pub runtime_state_snapshot_id: String,
    pub sequence: u64,
    pub occurred_at: String,
    pub monotonic_nanos: u64,
    pub producer: PrincipalIdentity,
    pub origin: EventOrigin,
    pub epistemic_class: String,
    pub event_type: String,
    pub payload: Value,
    pub payload_hash: String,
    pub previous_event_hash: Option<String>,
    pub event_hash: String,
    pub artifact_refs: Vec<Value>,
    pub redaction: RedactionRecord,
    pub inference: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AuditLink {
    pub protocol_id: String,
    pub log_id: String,
    pub sequence: u64,
    pub record_hash: String,
    pub previous_record_hash: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Attestation {
    pub key_id: String,
    pub algorithm: String,
    pub signature: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EventRange {
    pub session_id: String,
    pub first_sequence: u64,
    pub last_sequence: u64,
    pub head_hash: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EvidenceReceipt {
    pub schema_version: u64,
    pub receipt_id: String,
    pub protocol_id: String,
    pub receipt_type: String,
    pub subject_ids: Vec<String>,
    pub harness_version_ids: Vec<String>,
    pub runtime_state_snapshot_ids: Vec<String>,
    pub event_ranges: Vec<EventRange>,
    pub recorded_observation_event_ids: Vec<String>,
    pub verifier_outcome_event_ids: Vec<String>,
    pub inference_event_ids: Vec<String>,
    pub artifact_refs: Vec<Value>,
    pub producer: PrincipalIdentity,
    pub created_at: String,
    pub receipt_hash: String,
    pub audit_link: AuditLink,
    pub attestation: Attestation,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct AuditRecord {
    pub schema_version: u64,
    pub protocol_id: String,
    pub log_id: String,
    pub sequence: u64,
    pub subject_type: String,
    pub subject_id: String,
    pub subject_hash: String,
    pub occurred_at: String,
    pub producer: PrincipalIdentity,
    pub previous_record_hash: Option<String>,
    pub record_hash: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ReceiptEnvelope {
    pub schema_version: u64,
    pub audit_record: AuditRecord,
    pub receipt: EvidenceReceipt,
    pub envelope_hash: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PublicSignerRecord {
    pub schema_version: u64,
    pub key_id: String,
    pub algorithm: String,
    pub public_key_base64_url: String,
    pub principal: PrincipalIdentity,
    pub record_hash: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvidenceStatus {
    pub protocol_id: String,
    pub session_id: String,
    pub harness_version_id: String,
    pub event_count: u64,
    pub receipt_count: u64,
    pub event_head_hash: Option<String>,
    pub audit_head_hash: Option<String>,
    pub healthy: bool,
    pub failure: Option<String>,
}
