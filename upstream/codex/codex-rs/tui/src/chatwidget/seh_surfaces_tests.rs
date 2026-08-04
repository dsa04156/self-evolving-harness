use pretty_assertions::assert_eq;

use super::*;

#[test]
fn short_identity_preserves_the_domain_prefix() {
    assert_eq!(
        short_identity(&format!("hv-sha256:{}", "a".repeat(64))),
        "hv-sha256:aaaaaaaaaaaa…"
    );
}

#[test]
fn short_identity_leaves_short_values_unchanged() {
    assert_eq!(short_identity("current"), "current");
}
