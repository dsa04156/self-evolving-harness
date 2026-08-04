use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;

use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;

use crate::Result;
use crate::SehError;
use crate::bootstrap::INTEGRATION_VERSION;
use crate::bootstrap::UPSTREAM_COMMIT;
use crate::bootstrap::build_bootstrap_bundle;
use crate::canonical::sha256_value;
use crate::model::HarnessBundle;
use crate::model::HarnessPin;
use crate::model::PinRequest;
use crate::model::PinSelection;
use crate::model::ResolvedHarness;
use crate::verify::instructions_for;
use crate::verify::pin_identity_value;
use crate::verify::verify_bundle;
use crate::verify::verify_pin;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActivePointer {
    schema_version: u64,
    runtime_binding_hash: String,
    harness_version_id: String,
    bundle_hash: String,
    pointer_hash: String,
}

pub fn resolve_and_pin(codex_home: &Path, request: PinRequest) -> Result<ResolvedHarness> {
    validate_runtime_binding(&request)?;
    let store = SehStore::new(codex_home);
    store.ensure_layout()?;
    let binding_hash = sha256_serialized(&request.runtime_binding)?;

    if let Some(pin) = store.load_pin(&request.thread_id, &binding_hash)? {
        let bundle = store.load_pinned_bundle(&pin, &request)?;
        return Ok(ResolvedHarness {
            instructions: instructions_for(
                &bundle,
                request.is_subagent,
                &request.base_instructions,
            )?,
            pin,
        });
    }

    let inherited_from = request
        .parent_thread_id
        .as_deref()
        .or(request.forked_from_thread_id.as_deref());
    if let Some(source_thread_id) = inherited_from
        && let Some(source_pin) = store.load_pin(source_thread_id, &binding_hash)?
    {
        let bundle = store.load_pinned_bundle(&source_pin, &request)?;
        let pin = create_pin(
            &request.thread_id,
            Some(source_thread_id.to_string()),
            &bundle,
            PinSelection::Inherited,
        )?;
        store.save_pin(&pin)?;
        return Ok(ResolvedHarness {
            instructions: instructions_for(
                &bundle,
                request.is_subagent,
                &request.base_instructions,
            )?,
            pin,
        });
    }

    let bundle = if let Some(active) = store.load_active(&binding_hash)? {
        store.load_bundle(&active.harness_version_id, Some(&active.bundle_hash))?
    } else {
        let bundle =
            build_bootstrap_bundle(request.runtime_binding.clone(), &request.base_instructions)?;
        store.save_bundle(&bundle)?;
        store.save_active(&bundle)?;
        bundle
    };
    require(
        bundle.runtime_binding_hash == binding_hash,
        "active harness runtime binding mismatch",
    )?;
    let thread_had_another_binding = store.has_any_pin(&request.thread_id)?;
    let source_had_another_binding = match inherited_from {
        Some(thread_id) => store.has_any_pin(thread_id)?,
        None => false,
    };
    let selection = if thread_had_another_binding || source_had_another_binding {
        PinSelection::ConfigurationDerived
    } else if request.resumed {
        PinSelection::LegacyCurrent
    } else {
        PinSelection::Current
    };
    let pin = create_pin(&request.thread_id, None, &bundle, selection)?;
    store.save_pin(&pin)?;
    Ok(ResolvedHarness {
        instructions: instructions_for(&bundle, request.is_subagent, &request.base_instructions)?,
        pin,
    })
}

fn validate_runtime_binding(request: &PinRequest) -> Result<()> {
    require(
        request.runtime_binding.integration_version == INTEGRATION_VERSION,
        "integration version is not supported",
    )?;
    require(
        request.runtime_binding.upstream_commit == UPSTREAM_COMMIT,
        "Codex upstream commit is not supported",
    )?;
    require(!request.thread_id.is_empty(), "thread ID is empty")?;
    validate_filename(&request.thread_id)?;
    if let Some(parent) = &request.parent_thread_id {
        validate_filename(parent)?;
    }
    if let Some(parent) = &request.forked_from_thread_id {
        validate_filename(parent)?;
    }
    Ok(())
}

fn create_pin(
    thread_id: &str,
    inherited_from_thread_id: Option<String>,
    bundle: &HarnessBundle,
    selection: PinSelection,
) -> Result<HarnessPin> {
    let mut pin = HarnessPin {
        schema_version: 1,
        runtime_track: bundle.runtime_track.clone(),
        thread_id: thread_id.to_string(),
        inherited_from_thread_id,
        harness_version_id: bundle.harness_manifest.harness_version_id.clone(),
        harness_manifest_hash: bundle.harness_manifest.manifest_hash.clone(),
        harness_closure_hash: bundle
            .harness_manifest
            .identity
            .behavior_closure
            .closure_hash
            .clone(),
        runtime_binding_hash: bundle.runtime_binding_hash.clone(),
        bundle_hash: bundle.bundle_hash.clone(),
        selection,
        pin_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000"
            .to_string(),
    };
    pin.pin_hash = sha256_value(&pin_identity_value(&pin)?)?;
    verify_pin(&pin)?;
    Ok(pin)
}

struct SehStore {
    root: PathBuf,
}

impl SehStore {
    fn new(codex_home: &Path) -> Self {
        Self {
            root: codex_home.join("seh"),
        }
    }

    fn ensure_layout(&self) -> Result<()> {
        for directory in [self.harness_dir(), self.active_dir(), self.thread_dir()] {
            fs::create_dir_all(&directory).map_err(|source| SehError::Io {
                path: directory,
                source,
            })?;
        }
        Ok(())
    }

    fn save_bundle(&self, bundle: &HarnessBundle) -> Result<()> {
        verify_bundle(bundle)?;
        let path = self.bundle_path(&bundle.harness_manifest.harness_version_id)?;
        save_immutable_json(&path, bundle)
    }

    fn load_bundle(
        &self,
        harness_version_id: &str,
        bundle_hash: Option<&str>,
    ) -> Result<HarnessBundle> {
        let path = self.bundle_path(harness_version_id)?;
        let bundle: HarnessBundle = read_json(&path)?;
        verify_bundle(&bundle)?;
        require(
            bundle.harness_manifest.harness_version_id == harness_version_id,
            "bundle filename and HarnessVersion differ",
        )?;
        if let Some(expected) = bundle_hash {
            require(
                bundle.bundle_hash == expected,
                "active bundle hash mismatch",
            )?;
        }
        Ok(bundle)
    }

    fn save_active(&self, bundle: &HarnessBundle) -> Result<()> {
        let mut pointer = ActivePointer {
            schema_version: 1,
            runtime_binding_hash: bundle.runtime_binding_hash.clone(),
            harness_version_id: bundle.harness_manifest.harness_version_id.clone(),
            bundle_hash: bundle.bundle_hash.clone(),
            pointer_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000"
                .to_string(),
        };
        pointer.pointer_hash = sha256_value(&pointer_identity_value(&pointer)?)?;
        save_json_atomic(&self.active_path(&bundle.runtime_binding_hash)?, &pointer)
    }

    fn load_active(&self, runtime_binding_hash: &str) -> Result<Option<ActivePointer>> {
        let path = self.active_path(runtime_binding_hash)?;
        if !path.exists() {
            return Ok(None);
        }
        let pointer: ActivePointer = read_json(&path)?;
        require(
            pointer.schema_version == 1,
            "unsupported active pointer schema",
        )?;
        require(
            pointer.runtime_binding_hash == runtime_binding_hash,
            "active pointer binding mismatch",
        )?;
        require(
            pointer.pointer_hash == sha256_value(&pointer_identity_value(&pointer)?)?,
            "active pointer hash mismatch",
        )?;
        Ok(Some(pointer))
    }

    fn save_pin(&self, pin: &HarnessPin) -> Result<()> {
        verify_pin(pin)?;
        save_immutable_json(
            &self.pin_path(&pin.thread_id, &pin.runtime_binding_hash)?,
            pin,
        )
    }

    fn load_pin(&self, thread_id: &str, runtime_binding_hash: &str) -> Result<Option<HarnessPin>> {
        let path = self.pin_path(thread_id, runtime_binding_hash)?;
        if !path.exists() {
            return Ok(None);
        }
        let pin: HarnessPin = read_json(&path)?;
        verify_pin(&pin)?;
        require(
            pin.thread_id == thread_id,
            "pin filename and thread ID differ",
        )?;
        Ok(Some(pin))
    }

    fn has_any_pin(&self, thread_id: &str) -> Result<bool> {
        let directory = self.thread_pin_dir(thread_id)?;
        if !directory.exists() {
            return Ok(false);
        }
        let mut entries = fs::read_dir(&directory).map_err(|source| SehError::Io {
            path: directory.clone(),
            source,
        })?;
        Ok(entries
            .next()
            .transpose()
            .map_err(|source| SehError::Io {
                path: directory,
                source,
            })?
            .is_some())
    }

    fn load_pinned_bundle(&self, pin: &HarnessPin, request: &PinRequest) -> Result<HarnessBundle> {
        let bundle = self.load_bundle(&pin.harness_version_id, Some(&pin.bundle_hash))?;
        require(
            bundle.harness_manifest.manifest_hash == pin.harness_manifest_hash
                && bundle
                    .harness_manifest
                    .identity
                    .behavior_closure
                    .closure_hash
                    == pin.harness_closure_hash,
            "pin does not identify the persisted harness closure",
        )?;
        require(
            bundle.runtime_binding == request.runtime_binding
                && bundle.runtime_binding_hash == pin.runtime_binding_hash,
            "pinned harness is incompatible with the requested runtime binding",
        )?;
        Ok(bundle)
    }

    fn harness_dir(&self) -> PathBuf {
        self.root.join("harnesses")
    }

    fn active_dir(&self) -> PathBuf {
        self.root.join("active")
    }

    fn thread_dir(&self) -> PathBuf {
        self.root.join("threads")
    }

    fn bundle_path(&self, harness_version_id: &str) -> Result<PathBuf> {
        validate_filename(harness_version_id)?;
        Ok(self
            .harness_dir()
            .join(format!("{harness_version_id}.json")))
    }

    fn active_path(&self, runtime_binding_hash: &str) -> Result<PathBuf> {
        validate_filename(runtime_binding_hash)?;
        Ok(self
            .active_dir()
            .join(format!("{runtime_binding_hash}.json")))
    }

    fn thread_pin_dir(&self, thread_id: &str) -> Result<PathBuf> {
        validate_filename(thread_id)?;
        Ok(self.thread_dir().join(thread_id))
    }

    fn pin_path(&self, thread_id: &str, runtime_binding_hash: &str) -> Result<PathBuf> {
        validate_filename(runtime_binding_hash)?;
        Ok(self
            .thread_pin_dir(thread_id)?
            .join(format!("{runtime_binding_hash}.json")))
    }
}

fn save_immutable_json<T>(path: &Path, value: &T) -> Result<()>
where
    T: Serialize,
{
    if path.exists() {
        let existing: Value = read_json(path)?;
        let proposed = serde_json::to_value(value).map_err(|source| SehError::Json {
            path: path.to_path_buf(),
            source,
        })?;
        return require(existing == proposed, "immutable SEH record already differs");
    }
    save_json_atomic(path, value)
}

fn save_json_atomic<T>(path: &Path, value: &T) -> Result<()>
where
    T: Serialize,
{
    let parent = path
        .parent()
        .ok_or_else(|| SehError::Invalid("SEH record has no parent directory".to_string()))?;
    fs::create_dir_all(parent).map_err(|source| SehError::Io {
        path: parent.to_path_buf(),
        source,
    })?;
    let bytes = serde_json::to_vec_pretty(value).map_err(|source| SehError::Json {
        path: path.to_path_buf(),
        source,
    })?;
    let mut suffix = 0_u32;
    let (temporary, mut file) = loop {
        let temporary = parent.join(format!(
            ".{}.{}.{}.tmp",
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("record"),
            std::process::id(),
            suffix
        ));
        match secure_create_new(&temporary) {
            Ok(file) => break (temporary, file),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                suffix = suffix
                    .checked_add(1)
                    .ok_or_else(|| SehError::Invalid("too many temporary files".to_string()))?;
            }
            Err(source) => {
                return Err(SehError::Io {
                    path: temporary,
                    source,
                });
            }
        }
    };
    let write_result = (|| -> std::io::Result<()> {
        file.write_all(&bytes)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        fs::rename(&temporary, path)?;
        Ok(())
    })();
    if let Err(source) = write_result {
        let _ = fs::remove_file(&temporary);
        return Err(SehError::Io {
            path: path.to_path_buf(),
            source,
        });
    }
    Ok(())
}

fn secure_create_new(path: &Path) -> std::io::Result<fs::File> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)
}

fn read_json<T>(path: &Path) -> Result<T>
where
    T: for<'de> Deserialize<'de>,
{
    let bytes = fs::read(path).map_err(|source| SehError::Io {
        path: path.to_path_buf(),
        source,
    })?;
    serde_json::from_slice(&bytes).map_err(|source| SehError::Json {
        path: path.to_path_buf(),
        source,
    })
}

fn pointer_identity_value(pointer: &ActivePointer) -> Result<Value> {
    let mut value = serde_json::to_value(pointer)
        .map_err(|error| SehError::Invalid(format!("could not serialize pointer: {error}")))?;
    value
        .as_object_mut()
        .ok_or_else(|| SehError::Invalid("active pointer is not an object".to_string()))?
        .remove("pointerHash");
    Ok(value)
}

fn sha256_serialized<T: Serialize>(value: &T) -> Result<String> {
    sha256_value(
        &serde_json::to_value(value)
            .map_err(|error| SehError::Invalid(format!("could not serialize value: {error}")))?,
    )
}

pub(crate) fn validate_filename(value: &str) -> Result<()> {
    require(
        !value.is_empty()
            && value.len() <= 128
            && value.bytes().all(|byte| {
                byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':')
            }),
        "unsafe SEH record identifier",
    )
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
    use tempfile::TempDir;

    use super::*;
    use crate::bootstrap::INTEGRATION_VERSION;
    use crate::bootstrap::UPSTREAM_COMMIT;
    use crate::model::RuntimeBinding;

    fn request(thread_id: &str) -> PinRequest {
        PinRequest {
            thread_id: thread_id.to_string(),
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
            base_instructions: "Pinned system prompt".to_string(),
        }
    }

    #[test]
    fn resume_reuses_the_exact_pin() {
        let home = TempDir::new().unwrap();
        let first = resolve_and_pin(home.path(), request("thread-a")).unwrap();
        let mut resumed = request("thread-a");
        resumed.resumed = true;
        resumed.base_instructions = "A changed runtime default".to_string();
        let second = resolve_and_pin(home.path(), resumed).unwrap();
        assert_eq!(first.pin, second.pin);
        assert_eq!(second.instructions, "Pinned system prompt");
    }

    #[test]
    fn child_inherits_the_parent_harness_and_uses_subagent_prompt() {
        let home = TempDir::new().unwrap();
        let parent = resolve_and_pin(home.path(), request("thread-parent")).unwrap();
        let mut child_request = request("thread-child");
        child_request.parent_thread_id = Some("thread-parent".to_string());
        child_request.is_subagent = true;
        let child = resolve_and_pin(home.path(), child_request).unwrap();
        assert_eq!(child.pin.harness_version_id, parent.pin.harness_version_id);
        assert_eq!(child.pin.selection, PinSelection::Inherited);
        assert_eq!(
            child.pin.inherited_from_thread_id.as_deref(),
            Some("thread-parent")
        );
        assert!(child.instructions.contains("bounded Codex child agent"));
        assert!(child.instructions.contains("Pinned system prompt"));
    }

    #[test]
    fn tampered_pin_is_rejected() {
        let home = TempDir::new().unwrap();
        resolve_and_pin(home.path(), request("thread-a")).unwrap();
        let binding_hash = sha256_serialized(&request("thread-a").runtime_binding).unwrap();
        let pin_path = home
            .path()
            .join("seh/threads/thread-a")
            .join(format!("{binding_hash}.json"));
        let mut value: Value = serde_json::from_slice(&fs::read(&pin_path).unwrap()).unwrap();
        value["harnessVersionId"] = Value::String(format!("hv-sha256:{}", "f".repeat(64)));
        fs::write(&pin_path, serde_json::to_vec(&value).unwrap()).unwrap();
        assert!(resolve_and_pin(home.path(), request("thread-a")).is_err());
    }

    #[test]
    fn child_model_override_creates_a_configuration_version_instead_of_false_inheritance() {
        let home = TempDir::new().unwrap();
        let parent = resolve_and_pin(home.path(), request("thread-parent")).unwrap();
        let mut child_request = request("thread-child");
        child_request.parent_thread_id = Some("thread-parent".to_string());
        child_request.is_subagent = true;
        child_request.runtime_binding.model = "other-model".to_string();
        let child = resolve_and_pin(home.path(), child_request).unwrap();
        assert_ne!(child.pin.harness_version_id, parent.pin.harness_version_id);
        assert_eq!(child.pin.selection, PinSelection::ConfigurationDerived);
        assert_eq!(
            child.pin.inherited_from_thread_id, None,
            "configuration versions must not claim exact inheritance"
        );
    }

    #[test]
    fn reasoning_effort_override_creates_a_distinct_configuration_version() {
        let home = TempDir::new().unwrap();
        let baseline = resolve_and_pin(home.path(), request("thread-effort")).unwrap();
        let mut changed = request("thread-effort");
        changed.resumed = true;
        changed.runtime_binding.reasoning_effort = Some("xhigh".to_string());
        let rebound = resolve_and_pin(home.path(), changed).unwrap();
        assert_ne!(
            rebound.pin.harness_version_id,
            baseline.pin.harness_version_id
        );
        assert_eq!(rebound.pin.selection, PinSelection::ConfigurationDerived);
    }
}
