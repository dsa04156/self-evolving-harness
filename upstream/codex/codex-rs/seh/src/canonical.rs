use serde_json::Value;
use sha2::Digest;
use sha2::Sha256;

use crate::Result;
use crate::SehError;

const MAX_SAFE_IJSON_INTEGER: u64 = 9_007_199_254_740_991;

pub(crate) fn canonical_bytes(value: &Value) -> Result<Vec<u8>> {
    let mut output = Vec::new();
    write_value(value, "$", &mut output)?;
    Ok(output)
}

pub(crate) fn canonical_len(value: &Value) -> Result<u64> {
    u64::try_from(canonical_bytes(value)?.len())
        .map_err(|_| SehError::Invalid("canonical JSON is too large".to_string()))
}

pub(crate) fn sha256_value(value: &Value) -> Result<String> {
    Ok(format!("sha256:{}", sha256_bytes(&canonical_bytes(value)?)))
}

pub(crate) fn content_id(prefix: &str, value: &Value) -> Result<String> {
    Ok(format!(
        "{prefix}:{}",
        sha256_bytes(&canonical_bytes(value)?)
    ))
}

pub(crate) fn sha256_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut encoded = String::with_capacity(digest.len() * 2);
    for byte in digest {
        use std::fmt::Write;
        let _ = write!(encoded, "{byte:02x}");
    }
    encoded
}

fn write_value(value: &Value, location: &str, output: &mut Vec<u8>) -> Result<()> {
    match value {
        Value::Null => output.extend_from_slice(b"null"),
        Value::Bool(true) => output.extend_from_slice(b"true"),
        Value::Bool(false) => output.extend_from_slice(b"false"),
        Value::Number(number) => {
            let valid = number
                .as_i64()
                .is_some_and(|value| value.unsigned_abs() <= MAX_SAFE_IJSON_INTEGER)
                || number
                    .as_u64()
                    .is_some_and(|value| value <= MAX_SAFE_IJSON_INTEGER);
            if !valid {
                return Err(SehError::Invalid(format!(
                    "{location} is outside the integer-only I-JSON profile"
                )));
            }
            output.extend_from_slice(number.to_string().as_bytes());
        }
        Value::String(text) => output.extend_from_slice(
            serde_json::to_string(text)
                .map_err(|error| SehError::Invalid(error.to_string()))?
                .as_bytes(),
        ),
        Value::Array(items) => {
            output.push(b'[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    output.push(b',');
                }
                write_value(item, &format!("{location}[{index}]"), output)?;
            }
            output.push(b']');
        }
        Value::Object(object) => {
            output.push(b'{');
            let mut entries = object.iter().collect::<Vec<_>>();
            entries.sort_by_key(|(left, _)| *left);
            for (index, (key, item)) in entries.into_iter().enumerate() {
                if index > 0 {
                    output.push(b',');
                }
                output.extend_from_slice(
                    serde_json::to_string(key)
                        .map_err(|error| SehError::Invalid(error.to_string()))?
                        .as_bytes(),
                );
                output.push(b':');
                write_value(item, &format!("{location}.{key}"), output)?;
            }
            output.push(b'}');
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;
    use serde_json::json;

    use super::*;

    #[test]
    fn canonicalizes_objects_recursively() {
        assert_eq!(
            String::from_utf8(canonical_bytes(&json!({"z": 1, "a": {"b": 2, "a": 3}})).unwrap())
                .unwrap(),
            r#"{"a":{"a":3,"b":2},"z":1}"#
        );
    }

    #[test]
    fn rejects_floating_point_numbers() {
        assert!(canonical_bytes(&json!({"value": 1.5})).is_err());
    }
}
