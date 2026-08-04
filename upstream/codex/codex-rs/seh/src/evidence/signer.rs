use std::collections::BTreeMap;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ed25519_dalek::Signature;
use ed25519_dalek::Signer as _;
use ed25519_dalek::SigningKey;
use ed25519_dalek::Verifier as _;
use ed25519_dalek::VerifyingKey;
use rand::TryRngCore as _;
use rand::rngs::OsRng;
use serde::Serialize;
use serde_json::Value;
use serde_json::json;

use super::model::Attestation;
use super::model::PrincipalIdentity;
use super::model::PublicSignerRecord;
use crate::Result;
use crate::SehError;
use crate::bootstrap::INTEGRATION_VERSION;
use crate::bootstrap::UPSTREAM_COMMIT;
use crate::canonical::canonical_bytes;
use crate::canonical::sha256_value;

pub(crate) struct RuntimeSigner {
    signing_key: SigningKey,
    pub(crate) identity: PrincipalIdentity,
    pub(crate) key_id: String,
}

pub(crate) struct PublicVerifier {
    record: PublicSignerRecord,
    verifying_key: VerifyingKey,
}

pub(crate) type PublicVerifierRegistry = BTreeMap<String, PublicVerifier>;

impl RuntimeSigner {
    pub(crate) fn generate(trust_dir: &Path, deterministic_seed: Option<[u8; 32]>) -> Result<Self> {
        let mut seed = deterministic_seed.unwrap_or([0_u8; 32]);
        if deterministic_seed.is_none() {
            OsRng.try_fill_bytes(&mut seed).map_err(|error| {
                SehError::Invalid(format!(
                    "could not generate ephemeral runtime observation key: {error}"
                ))
            })?;
        }
        let signing_key = SigningKey::from_bytes(&seed);
        let public_key = signing_key.verifying_key().to_bytes();
        let public_key_base64_url = URL_SAFE_NO_PAD.encode(public_key);
        let public_digest = sha256_value(&json!({
            "algorithm": "Ed25519",
            "publicKeyBase64Url": public_key_base64_url,
        }))?;
        let suffix = public_digest
            .strip_prefix("sha256:")
            .ok_or_else(|| SehError::Integrity("invalid public-key digest".to_string()))?
            .to_string();
        let key_id = format!("seh-runtime-key-{suffix}");
        let identity = PrincipalIdentity {
            principal_id: "seh-runtime-observer".to_string(),
            role: "runtime".to_string(),
            identity_digest: public_digest,
            implementation_digest: sha256_value(&json!({
                "integrationVersion": INTEGRATION_VERSION,
                "profile": "seh-ephemeral-runtime-observer-v1",
                "upstreamCommit": UPSTREAM_COMMIT,
            }))?,
            instance_id: format!("seh-runtime-{suffix}"),
            model_identity_hash: None,
        };
        let mut public_record = PublicSignerRecord {
            schema_version: 1,
            key_id: key_id.clone(),
            algorithm: "Ed25519".to_string(),
            public_key_base64_url,
            principal: identity.clone(),
            record_hash: zero_hash(),
        };
        public_record.record_hash = sha256_value(&value_without(&public_record, &["recordHash"])?)?;
        let principals_dir = trust_dir.join("runtime-observation-principals");
        fs::create_dir_all(&principals_dir).map_err(|source| SehError::Io {
            path: principals_dir.clone(),
            source,
        })?;
        save_or_verify_public_record(
            &principals_dir.join(format!("{key_id}.json")),
            &public_record,
        )?;

        Ok(Self {
            signing_key,
            identity,
            key_id,
        })
    }

    pub(crate) fn attest<T: Serialize>(&self, value: &T) -> Result<Attestation> {
        let value = serde_json::to_value(value).map_err(|error| {
            SehError::Invalid(format!("could not serialize attestation: {error}"))
        })?;
        let signature = self.signing_key.sign(&canonical_bytes(&value)?);
        Ok(Attestation {
            key_id: self.key_id.clone(),
            algorithm: "Ed25519".to_string(),
            signature: URL_SAFE_NO_PAD.encode(signature.to_bytes()),
        })
    }
}

pub(crate) fn load_public_verifiers(trust_dir: &Path) -> Result<PublicVerifierRegistry> {
    let principals_dir = trust_dir.join("runtime-observation-principals");
    fs::create_dir_all(&principals_dir).map_err(|source| SehError::Io {
        path: principals_dir.clone(),
        source,
    })?;
    let mut paths = fs::read_dir(&principals_dir)
        .map_err(|source| SehError::Io {
            path: principals_dir.clone(),
            source,
        })?
        .map(|entry| {
            entry
                .map(|entry| entry.path())
                .map_err(|source| SehError::Io {
                    path: principals_dir.clone(),
                    source,
                })
        })
        .collect::<Result<Vec<_>>>()?;
    paths.sort();
    let mut registry = BTreeMap::new();
    for path in paths {
        require(
            path.extension().and_then(|extension| extension.to_str()) == Some("json"),
            "unexpected runtime principal artifact",
        )?;
        let bytes = fs::read(&path).map_err(|source| SehError::Io {
            path: path.clone(),
            source,
        })?;
        let record: PublicSignerRecord =
            serde_json::from_slice(&bytes).map_err(|source| SehError::Json {
                path: path.clone(),
                source,
            })?;
        require(
            record.schema_version == 1,
            "unsupported runtime principal schema",
        )?;
        require(
            record.algorithm == "Ed25519",
            "runtime principal algorithm mismatch",
        )?;
        require(
            path.file_stem().and_then(|stem| stem.to_str()) == Some(record.key_id.as_str()),
            "runtime principal filename mismatch",
        )?;
        require(
            record.record_hash == sha256_value(&value_without(&record, &["recordHash"])?)?,
            "runtime principal record hash mismatch",
        )?;
        let key_bytes = URL_SAFE_NO_PAD
            .decode(&record.public_key_base64_url)
            .map_err(|_| SehError::Integrity("runtime public key is not base64url".to_string()))?;
        let key_bytes: [u8; 32] = key_bytes.try_into().map_err(|bytes: Vec<u8>| {
            SehError::Integrity(format!(
                "runtime public key has {} bytes instead of 32",
                bytes.len()
            ))
        })?;
        let verifying_key = VerifyingKey::from_bytes(&key_bytes)
            .map_err(|_| SehError::Integrity("runtime public key is invalid".to_string()))?;
        require(
            record.principal.identity_digest
                == sha256_value(&json!({
                    "algorithm": "Ed25519",
                    "publicKeyBase64Url": record.public_key_base64_url,
                }))?,
            "runtime principal identity digest mismatch",
        )?;
        if registry
            .insert(
                record.key_id.clone(),
                PublicVerifier {
                    record,
                    verifying_key,
                },
            )
            .is_some()
        {
            return Err(SehError::Integrity(
                "duplicate runtime principal key ID".to_string(),
            ));
        }
    }
    Ok(registry)
}

pub(crate) fn verify_attestation<T: Serialize>(
    registry: &PublicVerifierRegistry,
    producer: &PrincipalIdentity,
    value: &T,
    attestation: &Attestation,
) -> Result<()> {
    require(
        attestation.algorithm == "Ed25519",
        "receipt attestation algorithm mismatch",
    )?;
    let verifier = registry
        .get(&attestation.key_id)
        .ok_or_else(|| SehError::Integrity("receipt signer is not registered".to_string()))?;
    require(
        verifier.record.principal == *producer,
        "receipt producer does not own the attestation key",
    )?;
    let signature_bytes = URL_SAFE_NO_PAD
        .decode(&attestation.signature)
        .map_err(|_| SehError::Integrity("receipt signature is not base64url".to_string()))?;
    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|_| SehError::Integrity("receipt signature has invalid length".to_string()))?;
    let value = serde_json::to_value(value)
        .map_err(|error| SehError::Invalid(format!("could not serialize attestation: {error}")))?;
    verifier
        .verifying_key
        .verify(&canonical_bytes(&value)?, &signature)
        .map_err(|_| SehError::Integrity("receipt signature verification failed".to_string()))
}

pub(crate) fn producer_is_registered(
    registry: &PublicVerifierRegistry,
    producer: &PrincipalIdentity,
) -> bool {
    registry
        .values()
        .any(|verifier| verifier.record.principal == *producer)
}

fn save_or_verify_public_record(path: &Path, record: &PublicSignerRecord) -> Result<()> {
    if path.exists() {
        let bytes = fs::read(path).map_err(|source| SehError::Io {
            path: path.to_path_buf(),
            source,
        })?;
        let existing: PublicSignerRecord =
            serde_json::from_slice(&bytes).map_err(|source| SehError::Json {
                path: path.to_path_buf(),
                source,
            })?;
        return require(existing == *record, "runtime signer public record changed");
    }
    let bytes = serde_json::to_vec_pretty(record)
        .map_err(|error| SehError::Invalid(format!("could not serialize public key: {error}")))?;
    atomic_write_public(path, &bytes)
}

fn atomic_write_public(path: &Path, bytes: &[u8]) -> Result<()> {
    let temp = temporary_path(path);
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|source| SehError::Io {
                path: temp.clone(),
                source,
            })?;
        file.write_all(bytes).map_err(|source| SehError::Io {
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
        fs::rename(&temp, path).map_err(|source| SehError::Io {
            path: path.to_path_buf(),
            source,
        })
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

fn temporary_path(path: &Path) -> std::path::PathBuf {
    let pid = std::process::id();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |duration| duration.as_nanos());
    path.with_extension(format!("tmp-{pid}-{nanos}"))
}

fn zero_hash() -> String {
    format!("sha256:{}", "0".repeat(64))
}

fn require(condition: bool, message: &str) -> Result<()> {
    if condition {
        Ok(())
    } else {
        Err(SehError::Integrity(message.to_string()))
    }
}

pub(crate) fn value_without<T: Serialize>(value: &T, fields: &[&str]) -> Result<Value> {
    let mut value = serde_json::to_value(value)
        .map_err(|error| SehError::Invalid(format!("could not serialize evidence: {error}")))?;
    let object = value
        .as_object_mut()
        .ok_or_else(|| SehError::Invalid("evidence value is not an object".to_string()))?;
    for field in fields {
        object.remove(*field);
    }
    Ok(value)
}
