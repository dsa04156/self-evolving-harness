use std::fs;
use std::fs::File;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::MutexGuard;
use std::sync::PoisonError;

use chrono::SecondsFormat;
use chrono::Utc;
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use serde_json::json;

use super::model::Attestation;
use super::model::AuditLink;
use super::model::AuditRecord;
use super::model::EventOrigin;
use super::model::EventRange;
use super::model::EvidenceReceipt;
use super::model::EvidenceStatus;
use super::model::ReceiptEnvelope;
use super::model::RedactionRecord;
use super::model::RuntimeEvent;
use super::signer::PublicVerifierRegistry;
use super::signer::RuntimeSigner;
use super::signer::load_public_verifiers;
use super::signer::producer_is_registered;
use super::signer::value_without;
use super::signer::verify_attestation;
use crate::Result;
use crate::SehError;
use crate::canonical::content_id;
use crate::canonical::sha256_value;
use crate::model::HarnessPin;
use crate::store::validate_filename;

const ZERO_HASH: &str = "sha256:0000000000000000000000000000000000000000000000000000000000000000";

#[derive(Clone)]
pub struct EvidenceHandle {
    inner: Arc<EvidenceInner>,
}

struct EvidenceInner {
    pin: HarnessPin,
    protocol_id: String,
    scanner_hash: String,
    evidence_root: PathBuf,
    _lock: File,
    state: Mutex<EvidenceState>,
    failure: Mutex<Option<String>>,
    clock: Arc<dyn EvidenceClock>,
}

struct EvidenceState {
    events: Vec<RuntimeEvent>,
    envelopes: Vec<ReceiptEnvelope>,
    signer: RuntimeSigner,
    last_monotonic_nanos: u64,
}

trait EvidenceClock: Send + Sync {
    fn stamp(&self) -> Result<EvidenceStamp>;
}

struct SystemEvidenceClock {
    started: std::time::Instant,
}

struct EvidenceStamp {
    occurred_at: String,
    monotonic_nanos: u64,
}

impl EvidenceClock for SystemEvidenceClock {
    fn stamp(&self) -> Result<EvidenceStamp> {
        let now = Utc::now();
        let monotonic_nanos = u64::try_from(self.started.elapsed().as_nanos())
            .map_err(|_| SehError::Invalid("process monotonic timestamp overflowed".to_string()))?;
        Ok(EvidenceStamp {
            occurred_at: now.to_rfc3339_opts(SecondsFormat::Millis, true),
            monotonic_nanos,
        })
    }
}

pub fn open_evidence(codex_home: &Path, pin: &HarnessPin, resumed: bool) -> Result<EvidenceHandle> {
    open_evidence_with_clock(
        codex_home,
        pin,
        resumed,
        Arc::new(SystemEvidenceClock {
            started: std::time::Instant::now(),
        }),
        None,
    )
}

/// Verifies a persisted evidence stream without opening a writer or appending events.
///
/// This is the read-only path used by diagnostics and external control surfaces.
/// It validates event hashes, receipt coverage, the append-only audit chain, and
/// registered signer attestations against the supplied immutable session pin.
pub fn verify_persisted_evidence(codex_home: &Path, pin: &HarnessPin) -> Result<EvidenceStatus> {
    validate_filename(&pin.thread_id)?;
    validate_filename(&pin.runtime_binding_hash)?;
    crate::verify::verify_pin(pin)?;
    let evidence_root = codex_home
        .join("seh/evidence/threads")
        .join(&pin.thread_id)
        .join(&pin.runtime_binding_hash);
    let events = read_numbered::<RuntimeEvent>(&evidence_root.join("events"))?;
    let envelopes = read_numbered::<ReceiptEnvelope>(&evidence_root.join("receipts"))?;
    let protocol_id = evidence_protocol_id()?;
    let scanner_hash = sha256_value(&json!({
        "profile": "metadata-only-redactor-v1",
        "storedFields": "allowlisted",
    }))?;
    let verifiers = load_public_verifiers(&codex_home.join("seh/trust"))?;
    verify_events(&events, pin, &protocol_id, &scanner_hash, &verifiers)?;
    verify_envelopes(&envelopes, &events, pin, &protocol_id, &verifiers)?;
    Ok(EvidenceStatus {
        protocol_id,
        session_id: pin.thread_id.clone(),
        harness_version_id: pin.harness_version_id.clone(),
        event_count: events.len() as u64,
        receipt_count: envelopes.len() as u64,
        event_head_hash: events.last().map(|event| event.event_hash.clone()),
        audit_head_hash: envelopes
            .last()
            .map(|envelope| envelope.audit_record.record_hash.clone()),
        healthy: true,
        failure: None,
    })
}

fn open_evidence_with_clock(
    codex_home: &Path,
    pin: &HarnessPin,
    resumed: bool,
    clock: Arc<dyn EvidenceClock>,
    deterministic_signing_seed: Option<[u8; 32]>,
) -> Result<EvidenceHandle> {
    validate_filename(&pin.thread_id)?;
    validate_filename(&pin.runtime_binding_hash)?;
    let evidence_root = codex_home
        .join("seh/evidence/threads")
        .join(&pin.thread_id)
        .join(&pin.runtime_binding_hash);
    let events_dir = evidence_root.join("events");
    let receipts_dir = evidence_root.join("receipts");
    fs::create_dir_all(&events_dir).map_err(|source| SehError::Io {
        path: events_dir.clone(),
        source,
    })?;
    fs::create_dir_all(&receipts_dir).map_err(|source| SehError::Io {
        path: receipts_dir.clone(),
        source,
    })?;
    let lock_path = evidence_root.join("writer.lock");
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&lock_path)
        .map_err(|source| SehError::Io {
            path: lock_path.clone(),
            source,
        })?;
    fs2::FileExt::try_lock_exclusive(&lock).map_err(|source| SehError::Io {
        path: lock_path,
        source,
    })?;

    let trust_dir = codex_home.join("seh/trust");
    let signer = RuntimeSigner::generate(&trust_dir, deterministic_signing_seed)?;
    let verifiers = load_public_verifiers(&trust_dir)?;
    let protocol_id = evidence_protocol_id()?;
    let scanner_hash = sha256_value(&json!({
        "profile": "metadata-only-redactor-v1",
        "storedFields": "allowlisted",
    }))?;
    let events = read_numbered::<RuntimeEvent>(&events_dir)?;
    let envelopes = read_numbered::<ReceiptEnvelope>(&receipts_dir)?;
    verify_events(&events, pin, &protocol_id, &scanner_hash, &verifiers)?;
    verify_envelopes(&envelopes, &events, pin, &protocol_id, &verifiers)?;
    let last_monotonic_nanos = events.last().map_or(0, |event| event.monotonic_nanos);
    let handle = EvidenceHandle {
        inner: Arc::new(EvidenceInner {
            pin: pin.clone(),
            protocol_id,
            scanner_hash,
            evidence_root,
            _lock: lock,
            state: Mutex::new(EvidenceState {
                events,
                envelopes,
                signer,
                last_monotonic_nanos,
            }),
            failure: Mutex::new(None),
            clock,
        }),
    };
    let event = handle.record_observation(
        if resumed {
            "thread_runtime_resumed"
        } else {
            "thread_runtime_started"
        },
        json!({
            "pinHash": pin.pin_hash,
            "pinSelection": pin.selection,
            "resumed": resumed,
            "runtimeBindingHash": pin.runtime_binding_hash,
        }),
        EventOrigin::runtime("seh-runtime"),
    )?;
    handle.create_receipt("session_initialization", &event)?;
    Ok(handle)
}

impl EvidenceHandle {
    pub fn ensure_healthy(&self) -> Result<()> {
        match lock(&self.inner.failure).clone() {
            Some(failure) => Err(SehError::Integrity(format!(
                "runtime evidence writer is unhealthy: {failure}"
            ))),
            None => Ok(()),
        }
    }

    pub fn status(&self) -> EvidenceStatus {
        let state = lock(&self.inner.state);
        let failure = lock(&self.inner.failure).clone();
        EvidenceStatus {
            protocol_id: self.inner.protocol_id.clone(),
            session_id: self.inner.pin.thread_id.clone(),
            harness_version_id: self.inner.pin.harness_version_id.clone(),
            event_count: state.events.len() as u64,
            receipt_count: state.envelopes.len() as u64,
            event_head_hash: state.events.last().map(|event| event.event_hash.clone()),
            audit_head_hash: state
                .envelopes
                .last()
                .map(|envelope| envelope.audit_record.record_hash.clone()),
            healthy: failure.is_none(),
            failure,
        }
    }

    pub fn evidence_root(&self) -> &Path {
        &self.inner.evidence_root
    }

    pub(crate) fn capture_observation(
        &self,
        event_type: &'static str,
        payload: Value,
        origin: EventOrigin,
    ) {
        if let Err(error) = self.record_observation(event_type, payload, origin) {
            self.mark_failure(&error);
            tracing::error!(event_type, "SEH evidence capture failed");
        }
    }

    pub(crate) fn capture_checkpoint(&self, event_type: &'static str, payload: Value) {
        let result = self
            .record_observation(event_type, payload, EventOrigin::runtime("seh-runtime"))
            .and_then(|event| {
                self.create_receipt("session_checkpoint", &event)
                    .map(|_| event)
            });
        if let Err(error) = result {
            self.mark_failure(&error);
            tracing::error!(event_type, "SEH evidence checkpoint failed");
        }
    }

    pub(crate) fn hash_opaque(&self, value: &str) -> String {
        sha256_value(&Value::String(value.to_string())).unwrap_or_else(|_| ZERO_HASH.to_string())
    }

    fn record_observation(
        &self,
        event_type: &str,
        payload: Value,
        origin: EventOrigin,
    ) -> Result<RuntimeEvent> {
        self.ensure_healthy()?;
        require_event_type(event_type)?;
        require(
            payload.is_object(),
            "runtime event payload is not an object",
        )?;
        let mut state = lock(&self.inner.state);
        let sequence = state.events.len() as u64;
        let previous_event_hash = state.events.last().map(|event| event.event_hash.clone());
        let mut stamp = self.inner.clock.stamp()?;
        if stamp.monotonic_nanos <= state.last_monotonic_nanos {
            stamp.monotonic_nanos = state.last_monotonic_nanos.checked_add(1).ok_or_else(|| {
                SehError::Invalid("monotonic evidence timestamp overflowed".to_string())
            })?;
        }
        require(
            stamp.monotonic_nanos <= 9_007_199_254_740_991,
            "monotonic evidence timestamp exceeds I-JSON range",
        )?;
        let runtime_state_snapshot_id = content_id(
            "rss-sha256",
            &json!({
                "eventType": event_type,
                "harnessVersionId": self.inner.pin.harness_version_id,
                "pinHash": self.inner.pin.pin_hash,
                "previousEventHash": previous_event_hash,
                "sequence": sequence,
                "sessionId": self.inner.pin.thread_id,
            }),
        )?;
        let payload_hash = sha256_value(&payload)?;
        let mut event = RuntimeEvent {
            schema_version: 2,
            event_id: format!("event:{}:{sequence}", self.inner.pin.thread_id),
            protocol_id: self.inner.protocol_id.clone(),
            session_id: self.inner.pin.thread_id.clone(),
            harness_version_id: self.inner.pin.harness_version_id.clone(),
            runtime_state_snapshot_id,
            sequence,
            occurred_at: stamp.occurred_at,
            monotonic_nanos: stamp.monotonic_nanos,
            producer: state.signer.identity.clone(),
            origin,
            epistemic_class: "recorded_observation".to_string(),
            event_type: event_type.to_string(),
            payload,
            payload_hash,
            previous_event_hash,
            event_hash: ZERO_HASH.to_string(),
            artifact_refs: Vec::new(),
            redaction: RedactionRecord {
                contains_known_secrets: false,
                applied_rule_ids: Vec::new(),
                scanner_hash: self.inner.scanner_hash.clone(),
            },
            inference: None,
        };
        event.event_hash = sha256_value(&value_without(&event, &["eventHash"])?)?;
        write_numbered(&self.inner.evidence_root.join("events"), sequence, &event)?;
        state.last_monotonic_nanos = event.monotonic_nanos;
        state.events.push(event.clone());
        Ok(event)
    }

    fn create_receipt(&self, receipt_type: &str, event: &RuntimeEvent) -> Result<EvidenceReceipt> {
        self.ensure_healthy()?;
        let mut state = lock(&self.inner.state);
        let sequence = state.envelopes.len() as u64;
        let first_event_sequence = state
            .envelopes
            .last()
            .and_then(|envelope| envelope.receipt.event_ranges.last())
            .map_or(0, |range| range.last_sequence + 1);
        require(
            first_event_sequence <= event.sequence,
            "evidence receipt event range is empty",
        )?;
        let covered_events = state
            .events
            .get(first_event_sequence as usize..=event.sequence as usize)
            .ok_or_else(|| {
                SehError::Integrity("evidence receipt event range is unavailable".to_string())
            })?;
        let receipt_id = format!(
            "receipt:{}:{sequence}:{}",
            self.inner.pin.thread_id,
            short_hash(&event.event_hash)?
        );
        let placeholder_link = AuditLink {
            protocol_id: self.inner.protocol_id.clone(),
            log_id: "seh-runtime-audit".to_string(),
            sequence,
            record_hash: ZERO_HASH.to_string(),
            previous_record_hash: None,
        };
        let placeholder_attestation = Attestation {
            key_id: state.signer.key_id.clone(),
            algorithm: "Ed25519".to_string(),
            signature: String::new(),
        };
        let mut receipt = EvidenceReceipt {
            schema_version: 2,
            receipt_id: receipt_id.clone(),
            protocol_id: self.inner.protocol_id.clone(),
            receipt_type: receipt_type.to_string(),
            subject_ids: vec![self.inner.pin.thread_id.clone()],
            harness_version_ids: vec![self.inner.pin.harness_version_id.clone()],
            runtime_state_snapshot_ids: covered_events
                .iter()
                .map(|event| event.runtime_state_snapshot_id.clone())
                .collect(),
            event_ranges: vec![EventRange {
                session_id: self.inner.pin.thread_id.clone(),
                first_sequence: first_event_sequence,
                last_sequence: event.sequence,
                head_hash: event.event_hash.clone(),
            }],
            recorded_observation_event_ids: covered_events
                .iter()
                .map(|event| event.event_id.clone())
                .collect(),
            verifier_outcome_event_ids: Vec::new(),
            inference_event_ids: Vec::new(),
            artifact_refs: Vec::new(),
            producer: state.signer.identity.clone(),
            created_at: event.occurred_at.clone(),
            receipt_hash: ZERO_HASH.to_string(),
            audit_link: placeholder_link,
            attestation: placeholder_attestation,
        };
        receipt.receipt_hash = sha256_value(&value_without(
            &receipt,
            &["receiptHash", "auditLink", "attestation"],
        )?)?;
        let previous_record_hash = state
            .envelopes
            .last()
            .map(|envelope| envelope.audit_record.record_hash.clone());
        let mut audit_record = AuditRecord {
            schema_version: 1,
            protocol_id: self.inner.protocol_id.clone(),
            log_id: "seh-runtime-audit".to_string(),
            sequence,
            subject_type: "EvidenceReceipt".to_string(),
            subject_id: receipt_id,
            subject_hash: receipt.receipt_hash.clone(),
            occurred_at: event.occurred_at.clone(),
            producer: state.signer.identity.clone(),
            previous_record_hash: previous_record_hash.clone(),
            record_hash: ZERO_HASH.to_string(),
        };
        audit_record.record_hash = sha256_value(&value_without(&audit_record, &["recordHash"])?)?;
        receipt.audit_link = AuditLink {
            protocol_id: audit_record.protocol_id.clone(),
            log_id: audit_record.log_id.clone(),
            sequence,
            record_hash: audit_record.record_hash.clone(),
            previous_record_hash,
        };
        receipt.attestation = state
            .signer
            .attest(&value_without(&receipt, &["attestation"])?)?;
        let mut envelope = ReceiptEnvelope {
            schema_version: 1,
            audit_record,
            receipt: receipt.clone(),
            envelope_hash: ZERO_HASH.to_string(),
        };
        envelope.envelope_hash = sha256_value(&value_without(&envelope, &["envelopeHash"])?)?;
        write_numbered(
            &self.inner.evidence_root.join("receipts"),
            sequence,
            &envelope,
        )?;
        state.envelopes.push(envelope);
        Ok(receipt)
    }

    fn mark_failure(&self, error: &SehError) {
        let mut failure = lock(&self.inner.failure);
        if failure.is_none() {
            *failure = Some(error.to_string());
        }
    }
}

fn evidence_protocol_id() -> Result<String> {
    content_id(
        "protocol-sha256",
        &json!({
            "canonicalizationProfile": "seh-c14n-int-v1",
            "eventSchemaVersion": 2,
            "profile": "seh-codex-runtime-evidence-v1",
            "receiptSchemaVersion": 2,
            "runtimeContractHash": crate::runtime_contract_hash(),
        }),
    )
}

fn verify_events(
    events: &[RuntimeEvent],
    pin: &HarnessPin,
    protocol_id: &str,
    scanner_hash: &str,
    verifiers: &PublicVerifierRegistry,
) -> Result<()> {
    let mut previous_hash: Option<&str> = None;
    let mut previous_monotonic = None;
    for (index, event) in events.iter().enumerate() {
        require(
            event.schema_version == 2,
            "unsupported runtime event schema",
        )?;
        require(
            event.sequence == index as u64,
            "runtime event sequence mismatch",
        )?;
        require(
            event.session_id == pin.thread_id
                && event.harness_version_id == pin.harness_version_id
                && event.protocol_id == protocol_id,
            "runtime event pin mismatch",
        )?;
        require(
            event.previous_event_hash.as_deref() == previous_hash,
            "runtime event hash chain is broken",
        )?;
        require(
            event.payload.is_object() && event.payload_hash == sha256_value(&event.payload)?,
            "runtime event payload changed",
        )?;
        require(
            event.event_hash == sha256_value(&value_without(event, &["eventHash"])?)?,
            "runtime event hash mismatch",
        )?;
        require(
            producer_is_registered(verifiers, &event.producer)
                && event.epistemic_class == "recorded_observation"
                && event.inference.is_none(),
            "runtime observation authority or epistemic class mismatch",
        )?;
        require(
            !event.redaction.contains_known_secrets
                && event.redaction.applied_rule_ids.is_empty()
                && event.redaction.scanner_hash == scanner_hash,
            "runtime event redaction record mismatch",
        )?;
        if let Some(previous) = previous_monotonic {
            require(
                event.monotonic_nanos > previous,
                "runtime event monotonic timestamp did not advance",
            )?;
        }
        previous_hash = Some(&event.event_hash);
        previous_monotonic = Some(event.monotonic_nanos);
    }
    Ok(())
}

fn verify_envelopes(
    envelopes: &[ReceiptEnvelope],
    events: &[RuntimeEvent],
    pin: &HarnessPin,
    protocol_id: &str,
    verifiers: &PublicVerifierRegistry,
) -> Result<()> {
    let mut previous_hash: Option<&str> = None;
    let mut next_event_sequence = 0_u64;
    for (index, envelope) in envelopes.iter().enumerate() {
        require(
            envelope.schema_version == 1,
            "unsupported receipt envelope schema",
        )?;
        require(
            envelope.envelope_hash == sha256_value(&value_without(envelope, &["envelopeHash"])?)?,
            "receipt envelope hash mismatch",
        )?;
        let audit = &envelope.audit_record;
        let receipt = &envelope.receipt;
        require(
            audit.sequence == index as u64
                && audit.protocol_id == protocol_id
                && audit.previous_record_hash.as_deref() == previous_hash,
            "receipt audit chain mismatch",
        )?;
        require(
            audit.record_hash == sha256_value(&value_without(audit, &["recordHash"])?)?,
            "receipt audit record hash mismatch",
        )?;
        require(
            receipt.schema_version == 2
                && receipt.protocol_id == protocol_id
                && receipt.harness_version_ids == vec![pin.harness_version_id.clone()]
                && receipt.subject_ids == vec![pin.thread_id.clone()]
                && producer_is_registered(verifiers, &receipt.producer),
            "evidence receipt authority or pin mismatch",
        )?;
        let range = receipt.event_ranges.as_slice();
        require(
            range.len() == 1
                && range[0].session_id == pin.thread_id
                && range[0].first_sequence == next_event_sequence
                && range[0].last_sequence >= range[0].first_sequence,
            "evidence receipt event range is not contiguous",
        )?;
        let covered_events = events
            .get(range[0].first_sequence as usize..=range[0].last_sequence as usize)
            .ok_or_else(|| {
                SehError::Integrity("evidence receipt references unavailable events".to_string())
            })?;
        require(
            covered_events.last().is_some_and(|event| {
                range[0].head_hash == event.event_hash && receipt.created_at == event.occurred_at
            }) && receipt.runtime_state_snapshot_ids
                == covered_events
                    .iter()
                    .map(|event| event.runtime_state_snapshot_id.clone())
                    .collect::<Vec<_>>()
                && receipt.recorded_observation_event_ids
                    == covered_events
                        .iter()
                        .map(|event| event.event_id.clone())
                        .collect::<Vec<_>>()
                && receipt.verifier_outcome_event_ids.is_empty()
                && receipt.inference_event_ids.is_empty(),
            "evidence receipt does not bind its recorded observations",
        )?;
        require(
            receipt.receipt_hash
                == sha256_value(&value_without(
                    receipt,
                    &["receiptHash", "auditLink", "attestation"],
                )?)?,
            "evidence receipt hash mismatch",
        )?;
        require(
            audit.subject_type == "EvidenceReceipt"
                && audit.subject_id == receipt.receipt_id
                && audit.subject_hash == receipt.receipt_hash
                && receipt.audit_link.record_hash == audit.record_hash
                && receipt.audit_link.previous_record_hash == audit.previous_record_hash
                && receipt.audit_link.sequence == audit.sequence
                && receipt.audit_link.protocol_id == audit.protocol_id
                && receipt.audit_link.log_id == audit.log_id,
            "evidence receipt audit link mismatch",
        )?;
        require(
            audit.producer == receipt.producer,
            "receipt and audit producer mismatch",
        )?;
        verify_attestation(
            verifiers,
            &receipt.producer,
            &value_without(receipt, &["attestation"])?,
            &receipt.attestation,
        )?;
        previous_hash = Some(&audit.record_hash);
        next_event_sequence = range[0].last_sequence.checked_add(1).ok_or_else(|| {
            SehError::Integrity("evidence receipt event sequence overflowed".to_string())
        })?;
    }
    Ok(())
}

fn read_numbered<T: DeserializeOwned>(directory: &Path) -> Result<Vec<T>> {
    let mut paths = fs::read_dir(directory)
        .map_err(|source| SehError::Io {
            path: directory.to_path_buf(),
            source,
        })?
        .map(|entry| {
            entry
                .map(|entry| entry.path())
                .map_err(|source| SehError::Io {
                    path: directory.to_path_buf(),
                    source,
                })
        })
        .collect::<Result<Vec<_>>>()?;
    paths.sort();
    let mut values = Vec::with_capacity(paths.len());
    for (index, path) in paths.into_iter().enumerate() {
        require(
            path.extension().and_then(|value| value.to_str()) == Some("json"),
            "unexpected evidence artifact",
        )?;
        let expected = format!("{index:020}.json");
        require(
            path.file_name().and_then(|value| value.to_str()) == Some(expected.as_str()),
            "evidence artifact sequence has a gap",
        )?;
        let bytes = fs::read(&path).map_err(|source| SehError::Io {
            path: path.clone(),
            source,
        })?;
        values.push(
            serde_json::from_slice(&bytes).map_err(|source| SehError::Json { path, source })?,
        );
    }
    Ok(values)
}

fn write_numbered<T: Serialize>(directory: &Path, sequence: u64, value: &T) -> Result<()> {
    let path = directory.join(format!("{sequence:020}.json"));
    require(
        !path.exists(),
        "append-only evidence artifact already exists",
    )?;
    let bytes = serde_json::to_vec(value)
        .map_err(|error| SehError::Invalid(format!("could not serialize evidence: {error}")))?;
    let temp = directory.join(format!(".{sequence:020}.{}.tmp", std::process::id()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|source| SehError::Io {
                path: temp.clone(),
                source,
            })?;
        file.write_all(&bytes).map_err(|source| SehError::Io {
            path: temp.clone(),
            source,
        })?;
        file.write_all(b"\n").map_err(|source| SehError::Io {
            path: temp.clone(),
            source,
        })?;
        file.sync_all().map_err(|source| SehError::Io {
            path: temp.clone(),
            source,
        })?;
        fs::rename(&temp, &path).map_err(|source| SehError::Io {
            path: path.clone(),
            source,
        })
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

fn short_hash(hash: &str) -> Result<&str> {
    hash.strip_prefix("sha256:")
        .and_then(|digest| digest.get(..16))
        .ok_or_else(|| SehError::Integrity("invalid SHA-256 value".to_string()))
}

fn require_event_type(value: &str) -> Result<()> {
    require(
        (3..=96).contains(&value.len())
            && value.starts_with(|character: char| character.is_ascii_lowercase())
            && value
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_'),
        "invalid runtime event type",
    )
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn require(condition: bool, message: &str) -> Result<()> {
    if condition {
        Ok(())
    } else {
        Err(SehError::Integrity(message.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicU64;
    use std::sync::atomic::Ordering;

    use pretty_assertions::assert_eq;
    use tempfile::TempDir;

    use super::*;
    use crate::PinRequest;
    use crate::RuntimeBinding;
    use crate::bootstrap::INTEGRATION_VERSION;
    use crate::bootstrap::UPSTREAM_COMMIT;
    use crate::resolve_and_pin;

    struct FixedClock {
        next: AtomicU64,
    }

    impl FixedClock {
        fn new() -> Self {
            Self {
                next: AtomicU64::new(1_000),
            }
        }
    }

    impl EvidenceClock for FixedClock {
        fn stamp(&self) -> Result<EvidenceStamp> {
            Ok(EvidenceStamp {
                occurred_at: "2026-08-04T00:00:00.000Z".to_string(),
                monotonic_nanos: self.next.fetch_add(1, Ordering::SeqCst),
            })
        }
    }

    fn fixture_pin(home: &Path) -> HarnessPin {
        resolve_and_pin(
            home,
            PinRequest {
                thread_id: "thread-evidence".to_string(),
                parent_thread_id: None,
                forked_from_thread_id: None,
                resumed: false,
                is_subagent: false,
                runtime_binding: RuntimeBinding {
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
                },
                base_instructions: "Pinned evidence prompt".to_string(),
            },
        )
        .unwrap()
        .pin
    }

    fn open_fixed(home: &Path, pin: &HarnessPin, resumed: bool) -> Result<EvidenceHandle> {
        open_evidence_with_clock(
            home,
            pin,
            resumed,
            Arc::new(FixedClock::new()),
            Some([7_u8; 32]),
        )
    }

    fn artifact_bytes(root: &Path, pin: &HarnessPin, kind: &str) -> Vec<Vec<u8>> {
        let directory = root
            .join("seh/evidence/threads")
            .join(&pin.thread_id)
            .join(&pin.runtime_binding_hash)
            .join(kind);
        let mut paths = fs::read_dir(directory)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect::<Vec<_>>();
        paths.sort();
        paths
            .into_iter()
            .map(|path| fs::read(path).unwrap())
            .collect()
    }

    #[test]
    fn same_pin_clock_signer_and_observations_are_byte_deterministic() {
        let first = TempDir::new().unwrap();
        let first_pin = fixture_pin(first.path());
        let first_handle = open_fixed(first.path(), &first_pin, false).unwrap();
        let secret = "must-not-appear-in-evidence";
        first_handle.capture_observation(
            "skill_invoked",
            json!({ "skillResourceHash": first_handle.hash_opaque(secret) }),
            EventOrigin::runtime("test-runtime"),
        );
        assert!(first_handle.status().healthy);
        drop(first_handle);

        let second = TempDir::new().unwrap();
        let second_pin = fixture_pin(second.path());
        assert_eq!(first_pin, second_pin);
        let second_handle = open_fixed(second.path(), &second_pin, false).unwrap();
        second_handle.capture_observation(
            "skill_invoked",
            json!({ "skillResourceHash": second_handle.hash_opaque(secret) }),
            EventOrigin::runtime("test-runtime"),
        );
        assert!(second_handle.status().healthy);
        drop(second_handle);

        assert_eq!(
            artifact_bytes(first.path(), &first_pin, "events"),
            artifact_bytes(second.path(), &second_pin, "events")
        );
        assert_eq!(
            artifact_bytes(first.path(), &first_pin, "receipts"),
            artifact_bytes(second.path(), &second_pin, "receipts")
        );
        let serialized = artifact_bytes(first.path(), &first_pin, "events").concat();
        assert!(!String::from_utf8_lossy(&serialized).contains(secret));
    }

    #[test]
    fn production_signer_persists_only_public_verification_material() {
        let home = TempDir::new().unwrap();
        let pin = fixture_pin(home.path());
        drop(open_evidence(home.path(), &pin, false).unwrap());
        let trust = home.path().join("seh/trust");
        let names = fs::read_dir(trust.join("runtime-observation-principals"))
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().to_string())
            .collect::<Vec<_>>();
        assert_eq!(names.len(), 1);
        assert!(names[0].ends_with(".json"));
        assert!(!fs::read_dir(&trust).unwrap().any(|entry| {
            entry
                .unwrap()
                .path()
                .extension()
                .is_some_and(|ext| ext == "key")
        }));
    }

    #[test]
    fn read_only_verifier_checks_the_stream_without_appending() {
        let home = TempDir::new().unwrap();
        let pin = fixture_pin(home.path());
        let handle = open_fixed(home.path(), &pin, false).unwrap();
        handle.capture_observation(
            "tool_completed",
            json!({ "toolName": "fake-read", "success": true }),
            EventOrigin::tool("fake-read"),
        );
        let expected = handle.status();
        drop(handle);
        let events_before = artifact_bytes(home.path(), &pin, "events");
        let receipts_before = artifact_bytes(home.path(), &pin, "receipts");

        let verified = verify_persisted_evidence(home.path(), &pin).unwrap();

        assert_eq!(verified, expected);
        assert_eq!(artifact_bytes(home.path(), &pin, "events"), events_before);
        assert_eq!(
            artifact_bytes(home.path(), &pin, "receipts"),
            receipts_before
        );
    }

    #[test]
    fn tampered_event_is_rejected_before_resume_appends() {
        let home = TempDir::new().unwrap();
        let pin = fixture_pin(home.path());
        drop(open_fixed(home.path(), &pin, false).unwrap());
        let event_path = home
            .path()
            .join("seh/evidence/threads")
            .join(&pin.thread_id)
            .join(&pin.runtime_binding_hash)
            .join("events/00000000000000000000.json");
        let mut value: Value = serde_json::from_slice(&fs::read(&event_path).unwrap()).unwrap();
        value["payload"]["resumed"] = Value::Bool(true);
        fs::write(&event_path, serde_json::to_vec(&value).unwrap()).unwrap();
        assert!(open_fixed(home.path(), &pin, true).is_err());
    }

    #[test]
    fn tampered_receipt_signature_is_rejected() {
        let home = TempDir::new().unwrap();
        let pin = fixture_pin(home.path());
        drop(open_fixed(home.path(), &pin, false).unwrap());
        let receipt_path = home
            .path()
            .join("seh/evidence/threads")
            .join(&pin.thread_id)
            .join(&pin.runtime_binding_hash)
            .join("receipts/00000000000000000000.json");
        let mut value: Value = serde_json::from_slice(&fs::read(&receipt_path).unwrap()).unwrap();
        value["receipt"]["attestation"]["signature"] = Value::String("A".repeat(86));
        let envelope = serde_json::from_value::<ReceiptEnvelope>(value.clone()).unwrap();
        value["envelopeHash"] = Value::String(
            sha256_value(&value_without(&envelope, &["envelopeHash"]).unwrap()).unwrap(),
        );
        fs::write(&receipt_path, serde_json::to_vec(&value).unwrap()).unwrap();
        assert!(open_fixed(home.path(), &pin, true).is_err());
    }

    #[test]
    fn second_writer_for_same_thread_and_binding_is_rejected() {
        let home = TempDir::new().unwrap();
        let pin = fixture_pin(home.path());
        let first = open_fixed(home.path(), &pin, false).unwrap();
        assert!(open_fixed(home.path(), &pin, true).is_err());
        drop(first);
        assert!(open_fixed(home.path(), &pin, true).is_ok());
    }

    #[test]
    fn resume_verifies_chain_and_advances_monotonic_time() {
        let home = TempDir::new().unwrap();
        let pin = fixture_pin(home.path());
        let first = open_fixed(home.path(), &pin, false).unwrap();
        assert_eq!(first.status().event_count, 1);
        drop(first);
        let resumed = open_fixed(home.path(), &pin, true).unwrap();
        let status = resumed.status();
        assert_eq!(status.event_count, 2);
        assert_eq!(status.receipt_count, 2);
        assert!(status.healthy);
    }
}
