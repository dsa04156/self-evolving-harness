mod bootstrap;
mod canonical;
mod model;
mod store;
mod verify;

pub use bootstrap::runtime_contract_hash;
pub use model::HarnessBundle;
pub use model::HarnessPin;
pub use model::PinRequest;
pub use model::PinSelection;
pub use model::ResolvedHarness;
pub use model::RuntimeBinding;
pub use store::resolve_and_pin;
pub use verify::verify_bundle;

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
