mod bootstrap;
mod canonical;
mod evidence;
mod model;
mod store;
mod verify;

pub use bootstrap::INTEGRATION_VERSION;
pub use bootstrap::UPSTREAM_COMMIT;
pub use bootstrap::runtime_contract_hash;
pub use evidence::EvidenceHandle;
pub use evidence::EvidenceStatus;
pub use evidence::install as install_evidence_extension;
pub use evidence::open_evidence;
pub use model::HarnessBundle;
pub use model::HarnessPin;
pub use model::PinRequest;
pub use model::PinSelection;
pub use model::ResolvedHarness;
pub use model::RuntimeBinding;
pub use store::resolve_and_pin;
pub use verify::verify_bundle;

pub fn configuration_text_hash(value: &str) -> Result<String> {
    canonical::sha256_value(&serde_json::Value::String(value.to_string()))
}

#[derive(Debug, thiserror::Error)]
pub enum SehError {
    #[error("SEH harness data is invalid: {0}")]
    Invalid(String),
    #[error("SEH harness integrity check failed: {0}")]
    Integrity(String),
    #[error("SEH harness I/O failed at {path}: {source}")]
    Io {
        path: std::path::PathBuf,
        source: std::io::Error,
    },
    #[error("SEH harness JSON failed at {path}: {source}")]
    Json {
        path: std::path::PathBuf,
        source: serde_json::Error,
    },
}

pub type Result<T> = std::result::Result<T, SehError>;
