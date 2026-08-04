use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use anyhow::Context;
use anyhow::bail;
use clap::Parser;
use codex_core::config::find_codex_home;
use codex_seh::HarnessBundle;
use codex_seh::HarnessPin;
use codex_seh::verify_bundle;
use codex_seh::verify_persisted_evidence;
use codex_seh::verify_pin;
use serde::Serialize;

#[derive(Debug, Parser)]
pub(crate) struct HarnessCommand {
    /// Inspect pins for this session UUID instead of the latest session.
    #[arg(long, value_name = "SESSION_ID")]
    thread: Option<String>,

    /// Show every persisted session pin, newest first.
    #[arg(long, default_value_t = false)]
    all: bool,

    /// Emit a stable machine-readable report.
    #[arg(long, default_value_t = false)]
    json: bool,
}

#[derive(Debug, Parser)]
pub(crate) struct EvidenceCommand {
    /// Inspect evidence for this session UUID instead of the latest session.
    #[arg(long, value_name = "SESSION_ID")]
    thread: Option<String>,

    /// Verify every persisted evidence stream, newest first.
    #[arg(long, default_value_t = false)]
    all: bool,

    /// Emit a stable machine-readable report.
    #[arg(long, default_value_t = false)]
    json: bool,
}

#[derive(Debug, Parser)]
pub(crate) struct EvolutionCommand {
    /// Emit a stable machine-readable report.
    #[arg(long, default_value_t = false)]
    json: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HarnessReport {
    schema_version: u32,
    status: &'static str,
    pins: Vec<HarnessPinReport>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HarnessPinReport {
    thread_id: String,
    harness_version_id: String,
    runtime_binding_hash: String,
    bundle_hash: String,
    pin_hash: String,
    selection: String,
    model: String,
    model_provider: String,
    reasoning_effort: Option<String>,
    component_count: usize,
    verified: bool,
    #[serde(skip)]
    modified_nanos: u128,
    #[serde(skip)]
    pin: HarnessPin,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EvidenceReport {
    schema_version: u32,
    status: &'static str,
    streams: Vec<EvidenceStreamReport>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EvidenceStreamReport {
    thread_id: String,
    harness_version_id: String,
    protocol_id: String,
    event_count: u64,
    receipt_count: u64,
    event_head_hash: Option<String>,
    audit_head_hash: Option<String>,
    verified: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EvolutionReport {
    schema_version: u32,
    status: &'static str,
    task_lifecycle: [&'static str; 6],
    harness_lifecycle: [&'static str; 9],
    mutable_mvp: [&'static str; 8],
    immutable_mvp: [&'static str; 9],
    message: &'static str,
}

pub(crate) fn run_harness(command: HarnessCommand) -> anyhow::Result<()> {
    let codex_home = find_codex_home()?;
    let mut pins = load_pin_reports(&codex_home, command.thread.as_deref())?;
    select_reports(&mut pins, command.all);
    let report = HarnessReport {
        schema_version: 1,
        status: if pins.is_empty() { "empty" } else { "ok" },
        pins,
    };
    if command.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        render_harness(&report);
    }
    Ok(())
}

pub(crate) fn run_evidence(command: EvidenceCommand) -> anyhow::Result<()> {
    let codex_home = find_codex_home()?;
    let mut pins = load_pin_reports(&codex_home, command.thread.as_deref())?;
    select_reports(&mut pins, command.all);
    let streams = pins
        .iter()
        .map(|pin| {
            let status = verify_persisted_evidence(&codex_home, &pin.pin)
                .with_context(|| format!("evidence verification failed for {}", pin.thread_id))?;
            Ok(EvidenceStreamReport {
                thread_id: status.session_id,
                harness_version_id: status.harness_version_id,
                protocol_id: status.protocol_id,
                event_count: status.event_count,
                receipt_count: status.receipt_count,
                event_head_hash: status.event_head_hash,
                audit_head_hash: status.audit_head_hash,
                verified: status.healthy,
            })
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    let report = EvidenceReport {
        schema_version: 1,
        status: if streams.is_empty() { "empty" } else { "ok" },
        streams,
    };
    if command.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        render_evidence(&report);
    }
    Ok(())
}

pub(crate) fn run_evolution(command: EvolutionCommand) -> anyhow::Result<()> {
    let report = EvolutionReport {
        schema_version: 1,
        status: "not_enabled",
        task_lifecycle: [
            "context",
            "model",
            "tool_call",
            "tool_result",
            "verification",
            "completion_or_retry",
        ],
        harness_lifecycle: [
            "draft",
            "candidate",
            "statically_validated",
            "evaluating",
            "canary",
            "active",
            "retired",
            "rejected",
            "rolled_back",
        ],
        mutable_mvp: [
            "system_prompt",
            "context_policy",
            "memory_retrieval_policy",
            "skills",
            "workflow_policy",
            "routing_policy",
            "tool_descriptions",
            "subagent_prompts",
        ],
        immutable_mvp: [
            "evaluator",
            "permission_and_safety_policy",
            "benchmark_data",
            "budget",
            "audit_log",
            "model_identity",
            "tool_implementation",
            "middleware",
            "optimizer_code",
        ],
        message: "Candidate mutation and promotion are intentionally disabled until the external evaluator and immutable promotion boundary are implemented.",
    };
    if command.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        println!("◈ Harness Evolution  [NOT ENABLED]");
        println!("  Task loop      context → model → tools → verify → complete/retry");
        println!("  Evolution loop traces → attribute → candidate → evaluate → decide");
        println!("  Boundary       evaluator · safety · budget · model · audit are immutable");
        println!();
        println!("  {}", report.message);
    }
    Ok(())
}

fn load_pin_reports(
    codex_home: &Path,
    requested_thread: Option<&str>,
) -> anyhow::Result<Vec<HarnessPinReport>> {
    if let Some(thread) = requested_thread
        && !safe_identifier(thread)
    {
        bail!("session ID contains unsupported characters");
    }
    let root = codex_home.join("seh/threads");
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut paths = Vec::new();
    for thread_entry in fs::read_dir(&root).with_context(|| root.display().to_string())? {
        let thread_entry = thread_entry?;
        if !thread_entry.file_type()?.is_dir() {
            continue;
        }
        let thread_name = thread_entry.file_name();
        if requested_thread.is_some_and(|requested| thread_name != requested) {
            continue;
        }
        for pin_entry in fs::read_dir(thread_entry.path())? {
            let pin_entry = pin_entry?;
            if pin_entry.file_type()?.is_file()
                && pin_entry
                    .path()
                    .extension()
                    .is_some_and(|extension| extension == "json")
            {
                paths.push(pin_entry.path());
            }
        }
    }
    let mut reports = paths
        .into_iter()
        .map(|path| load_pin_report(codex_home, &path))
        .collect::<anyhow::Result<Vec<_>>>()?;
    reports.sort_by(|left, right| {
        right
            .modified_nanos
            .cmp(&left.modified_nanos)
            .then_with(|| left.thread_id.cmp(&right.thread_id))
    });
    Ok(reports)
}

fn load_pin_report(codex_home: &Path, path: &Path) -> anyhow::Result<HarnessPinReport> {
    let pin: HarnessPin = read_json(path)?;
    verify_pin(&pin).with_context(|| format!("invalid harness pin at {}", path.display()))?;
    if !safe_identifier(&pin.harness_version_id) {
        bail!("unsafe HarnessVersion ID in {}", path.display());
    }
    let bundle_path = codex_home
        .join("seh/harnesses")
        .join(format!("{}.json", pin.harness_version_id));
    let bundle: HarnessBundle = read_json(&bundle_path)?;
    verify_bundle(&bundle)
        .with_context(|| format!("invalid harness bundle at {}", bundle_path.display()))?;
    if bundle.bundle_hash != pin.bundle_hash
        || bundle.harness_manifest.manifest_hash != pin.harness_manifest_hash
        || bundle.runtime_binding_hash != pin.runtime_binding_hash
    {
        bail!("session pin does not match its harness bundle");
    }
    let modified_nanos = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |duration| duration.as_nanos());
    let selection = serde_json::to_value(pin.selection)?
        .as_str()
        .unwrap_or("unknown")
        .to_string();
    Ok(HarnessPinReport {
        thread_id: pin.thread_id.clone(),
        harness_version_id: pin.harness_version_id.clone(),
        runtime_binding_hash: pin.runtime_binding_hash.clone(),
        bundle_hash: pin.bundle_hash.clone(),
        pin_hash: pin.pin_hash.clone(),
        selection,
        model: bundle.runtime_binding.model,
        model_provider: bundle.runtime_binding.model_provider,
        reasoning_effort: bundle.runtime_binding.reasoning_effort,
        component_count: bundle.component_entries.len(),
        verified: true,
        modified_nanos,
        pin,
    })
}

fn select_reports(reports: &mut Vec<HarnessPinReport>, all: bool) {
    if !all && reports.len() > 1 {
        reports.truncate(1);
    }
}

fn render_harness(report: &HarnessReport) {
    if report.pins.is_empty() {
        println!("◈ HarnessVersion  [NO SESSION PIN]");
        println!("  Start `seh` once to create an immutable HarnessVersion pin.");
        return;
    }
    for (index, pin) in report.pins.iter().enumerate() {
        if index > 0 {
            println!();
        }
        println!("◈ HarnessVersion  [VERIFIED]");
        println!("  session      {}", pin.thread_id);
        println!("  version      {}", short_identity(&pin.harness_version_id));
        println!("  model        {} ({})", pin.model, pin.model_provider);
        println!(
            "  reasoning    {}",
            pin.reasoning_effort
                .as_deref()
                .unwrap_or("provider default")
        );
        println!("  components   {}", pin.component_count);
        println!("  selection    {}", pin.selection);
        println!("  pin          {}", short_identity(&pin.pin_hash));
    }
}

fn render_evidence(report: &EvidenceReport) {
    if report.streams.is_empty() {
        println!("◈ Evidence Plane  [NO SESSION EVIDENCE]");
        println!("  Start `seh` once to open a signed append-only evidence stream.");
        return;
    }
    for (index, stream) in report.streams.iter().enumerate() {
        if index > 0 {
            println!();
        }
        println!("◈ Evidence Plane  [VERIFIED]");
        println!("  session      {}", stream.thread_id);
        println!(
            "  harness      {}",
            short_identity(&stream.harness_version_id)
        );
        println!("  events       {}", stream.event_count);
        println!("  receipts     {}", stream.receipt_count);
        println!(
            "  event head   {}",
            stream
                .event_head_hash
                .as_deref()
                .map(short_identity)
                .unwrap_or_else(|| "genesis".to_string())
        );
        println!(
            "  audit head   {}",
            stream
                .audit_head_hash
                .as_deref()
                .map(short_identity)
                .unwrap_or_else(|| "genesis".to_string())
        );
    }
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> anyhow::Result<T> {
    let bytes = fs::read(path).with_context(|| format!("could not read {}", path.display()))?;
    serde_json::from_slice(&bytes).with_context(|| format!("invalid JSON at {}", path.display()))
}

fn safe_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
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
mod tests {
    use super::*;

    #[test]
    fn identifiers_reject_path_traversal() {
        assert!(safe_identifier("thread-123"));
        assert!(!safe_identifier("../thread-123"));
        assert!(!safe_identifier("thread/123"));
    }

    #[test]
    fn long_content_identity_is_compact_for_humans() {
        assert_eq!(
            short_identity(&format!("hv-sha256:{}", "a".repeat(64))),
            "hv-sha256:aaaaaaaaaaaa…"
        );
    }
}
