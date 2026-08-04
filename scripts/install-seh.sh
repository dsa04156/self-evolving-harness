#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
codex_rs="${repo_root}/upstream/codex/codex-rs"
profile="release"
skip_build=0
requested_install_dir="${SEH_INSTALL_DIR:-}"

usage() {
  printf '%s\n' \
    'Install the Codex-derived SEH Code binary.' \
    '' \
    'Usage: ./scripts/install-seh.sh [--debug] [--no-build] [--install-dir DIR]' \
    '' \
    '  --debug            Install target/debug/seh instead of a release build' \
    '  --no-build         Install an already-built binary' \
    '  --install-dir DIR  Override the detected user binary directory'
}

while (($# > 0)); do
  case "$1" in
    --debug)
      profile="debug"
      shift
      ;;
    --no-build)
      skip_build=1
      shift
      ;;
    --install-dir)
      if (($# < 2)); then
        printf 'error: --install-dir requires a directory\n' >&2
        exit 2
      fi
      requested_install_dir="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'error: unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -n "${requested_install_dir}" ]]; then
  install_dir="${requested_install_dir}"
else
  existing_seh="$(command -v seh 2>/dev/null || true)"
  if [[ -n "${existing_seh}" && "${existing_seh}" == "${HOME}/"* ]]; then
    install_dir="$(dirname -- "${existing_seh}")"
  elif [[ -d "${HOME}/.npm-global/bin" ]]; then
    install_dir="${HOME}/.npm-global/bin"
  else
    install_dir="${XDG_BIN_HOME:-${HOME}/.local/bin}"
  fi
fi

if [[ -z "${install_dir}" || "${install_dir}" == "/" || "${install_dir}" == "${HOME}" ]]; then
  printf 'error: refusing unsafe install directory: %s\n' "${install_dir:-<empty>}" >&2
  exit 2
fi

if ((skip_build == 0)); then
  if [[ "${profile}" == "release" ]]; then
    cargo_args=(build --locked --release -p codex-cli --bin seh)
  else
    cargo_args=(build --locked -p codex-cli --bin seh)
  fi
  printf 'Building SEH Code (%s)...\n' "${profile}"
  cargo "${cargo_args[@]}" --manifest-path "${codex_rs}/Cargo.toml"
fi

binary="${codex_rs}/target/${profile}/seh"
if [[ ! -x "${binary}" ]]; then
  printf 'error: built binary is missing: %s\n' "${binary}" >&2
  exit 1
fi

mkdir -p -- "${install_dir}"
target="${install_dir}/seh"
if [[ -L "${target}" && ! -e "${install_dir}/seh-standalone-v0.9" ]]; then
  previous_target="$(readlink -- "${target}")"
  ln -s -- "${previous_target}" "${install_dir}/seh-standalone-v0.9"
  printf 'Preserved the previous standalone CLI as %s\n' "${install_dir}/seh-standalone-v0.9"
fi

temporary_target="${install_dir}/.seh.install.$$"
install -m 0755 -- "${binary}" "${temporary_target}"
mv -f -- "${temporary_target}" "${target}"

printf '\nInstalled SEH Code: %s\n' "${target}"
printf 'Version: '
"${target}" --version
printf '\nNext: run `seh`, then use `/model`, `/harness`, and `/evidence`.\n'
printf 'ChatGPT login is supported with `seh login`; an API key is not required.\n'

case ":${PATH}:" in
  *":${install_dir}:"*) ;;
  *) printf 'Add %s to PATH before invoking `seh` from another shell.\n' "${install_dir}" ;;
esac
