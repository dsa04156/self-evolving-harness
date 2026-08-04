use std::fs;
use std::path::Path;
use std::path::PathBuf;

use serde::Deserialize;
use serde_json::Value;

use super::*;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SehPinSummary {
    harness_version_id: String,
    harness_manifest_hash: String,
    harness_closure_hash: String,
    runtime_binding_hash: String,
    bundle_hash: String,
    selection: String,
    pin_hash: String,
}

#[derive(Debug)]
struct EvidenceSummary {
    event_count: usize,
    receipt_count: usize,
    latest_receipt_id: Option<String>,
    audit_head: Option<String>,
    signer_key_id: Option<String>,
}

impl ChatWidget {
    pub(super) fn add_seh_harness_output(&mut self) {
        let Some(thread_id) = self.thread_id else {
            self.add_error_message("The session HarnessVersion is not pinned yet.".to_string());
            return;
        };
        match load_thread_pin(&self.config.codex_home, &thread_id.to_string()) {
            Ok(pin) => self.add_to_history(history_cell::new_seh_panel(
                "Pinned HarnessVersion",
                "IMMUTABLE SESSION PIN",
                vec![
                    ("version".to_string(), short_identity(&pin.harness_version_id)),
                    (
                        "manifest".to_string(),
                        short_identity(&pin.harness_manifest_hash),
                    ),
                    ("closure".to_string(), short_identity(&pin.harness_closure_hash)),
                    ("bundle".to_string(), short_identity(&pin.bundle_hash)),
                    ("selection".to_string(), pin.selection),
                    ("pin".to_string(), short_identity(&pin.pin_hash)),
                ],
                Some(
                    "Resume, retry, and recovery reuse this version; they are not harness evolution."
                        .to_string(),
                ),
            )),
            Err(error) => self.add_to_history(history_cell::new_error_event(error)),
        }
    }

    pub(super) fn add_seh_evidence_output(&mut self) {
        let Some(thread_id) = self.thread_id else {
            self.add_error_message("The session evidence stream is not open yet.".to_string());
            return;
        };
        let result =
            load_thread_pin(&self.config.codex_home, &thread_id.to_string()).and_then(|pin| {
                load_evidence_summary(
                    &self.config.codex_home,
                    &thread_id.to_string(),
                    &pin.runtime_binding_hash,
                )
                .map(|summary| (pin, summary))
            });
        match result {
            Ok((pin, summary)) => self.add_to_history(history_cell::new_seh_panel(
                "Evidence Plane",
                "SIGNED · APPEND-ONLY",
                vec![
                    ("events".to_string(), summary.event_count.to_string()),
                    ("receipts".to_string(), summary.receipt_count.to_string()),
                    (
                        "latest".to_string(),
                        summary
                            .latest_receipt_id
                            .as_deref()
                            .map(short_identity)
                            .unwrap_or_else(|| "waiting for first receipt".to_string()),
                    ),
                    (
                        "audit head".to_string(),
                        summary
                            .audit_head
                            .as_deref()
                            .map(short_identity)
                            .unwrap_or_else(|| "genesis".to_string()),
                    ),
                    (
                        "signer".to_string(),
                        summary
                            .signer_key_id
                            .unwrap_or_else(|| "ephemeral runtime key".to_string()),
                    ),
                    (
                        "harness".to_string(),
                        short_identity(&pin.harness_version_id),
                    ),
                ],
                Some(
                    "Observed facts are recorded separately from verifier outcomes and inference."
                        .to_string(),
                ),
            )),
            Err(error) => self.add_to_history(history_cell::new_error_event(error)),
        }
    }

    pub(super) fn add_seh_evolution_output(&mut self) {
        let version = self
            .thread_id
            .and_then(|thread_id| {
                load_thread_pin(&self.config.codex_home, &thread_id.to_string()).ok()
            })
            .map(|pin| short_identity(&pin.harness_version_id))
            .unwrap_or_else(|| "pending session pin".to_string());
        self.add_to_history(history_cell::new_seh_panel(
            "Two Runtime Lifecycles",
            "SEPARATE BY DESIGN",
            vec![
                (
                    "task loop".to_string(),
                    "model → tools → verify → complete/retry".to_string(),
                ),
                ("task version".to_string(), version),
                ("trace corpus".to_string(), "signed runtime evidence".to_string()),
                (
                    "evolution".to_string(),
                    "candidate evaluation not enabled yet".to_string(),
                ),
                (
                    "mutable MVP".to_string(),
                    "prompt · context · memory · skills · routing".to_string(),
                ),
                (
                    "immutable".to_string(),
                    "evaluator · safety · budget · model · audit".to_string(),
                ),
            ],
            Some(
                "A retry never creates a HarnessVersion. Evolution requires a new version and an independent decision."
                    .to_string(),
            ),
        ));
    }
}

fn load_thread_pin(codex_home: &Path, thread_id: &str) -> Result<SehPinSummary, String> {
    let directory = codex_home.join("seh").join("threads").join(thread_id);
    let mut paths = json_files(&directory)?;
    paths.sort();
    let path = paths
        .pop()
        .ok_or_else(|| "No persisted HarnessVersion pin exists for this session.".to_string())?;
    read_json(&path).map_err(|error| format!("Could not read the session harness pin: {error}"))
}

fn load_evidence_summary(
    codex_home: &Path,
    thread_id: &str,
    runtime_binding_hash: &str,
) -> Result<EvidenceSummary, String> {
    let root = codex_home
        .join("seh")
        .join("evidence")
        .join("threads")
        .join(thread_id)
        .join(runtime_binding_hash);
    let events = json_files(&root.join("events"))?;
    let mut receipts = json_files(&root.join("receipts"))?;
    receipts.sort();
    let latest = receipts
        .last()
        .map(|path| read_json::<Value>(path))
        .transpose()?;
    let receipt = latest.as_ref().and_then(|value| value.get("receipt"));
    Ok(EvidenceSummary {
        event_count: events.len(),
        receipt_count: receipts.len(),
        latest_receipt_id: receipt
            .and_then(|value| value.get("receiptId"))
            .and_then(Value::as_str)
            .map(ToString::to_string),
        audit_head: receipt
            .and_then(|value| value.pointer("/auditLink/recordHash"))
            .and_then(Value::as_str)
            .map(ToString::to_string),
        signer_key_id: receipt
            .and_then(|value| value.pointer("/attestation/keyId"))
            .and_then(Value::as_str)
            .map(ToString::to_string),
    })
}

fn json_files(directory: &Path) -> Result<Vec<PathBuf>, String> {
    let entries = fs::read_dir(directory)
        .map_err(|error| format!("{} is unavailable: {error}", directory.display()))?;
    entries
        .map(|entry| entry.map_err(|error| error.to_string()))
        .filter_map(|entry| match entry {
            Ok(entry)
                if entry
                    .path()
                    .extension()
                    .is_some_and(|extension| extension == "json") =>
            {
                Some(Ok(entry.path()))
            }
            Ok(_) => None,
            Err(error) => Some(Err(error)),
        })
        .collect()
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

fn short_identity(value: &str) -> String {
    let (prefix, digest) = value
        .rsplit_once(':')
        .map_or(("", value), |(prefix, digest)| (prefix, digest));
    if digest.chars().count() <= 16 {
        return value.to_string();
    }
    if prefix.is_empty() {
        format!("{}…", digest.chars().take(16).collect::<String>())
    } else {
        format!("{prefix}:{}…", digest.chars().take(12).collect::<String>())
    }
}

#[cfg(test)]
#[path = "seh_surfaces_tests.rs"]
mod tests;
