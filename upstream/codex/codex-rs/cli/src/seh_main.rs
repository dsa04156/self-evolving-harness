// Keep the compatibility `codex` and product `seh` binaries on one dispatcher
// while giving Cargo distinct entrypoint paths (and therefore clean diagnostics).
include!("main.rs");
