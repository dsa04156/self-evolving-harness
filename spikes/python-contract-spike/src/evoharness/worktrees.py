# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
import subprocess


@dataclass(frozen=True, slots=True)
class CandidateWorktree:
    candidate_id: str
    path: Path
    base_ref: str


class GitWorktreeManager:
    """Creates a detached candidate worktree; the baseline working tree is never edited."""

    def __init__(self, *, repository: Path, candidates_root: Path) -> None:
        self.repository = repository.resolve(strict=True)
        self.candidates_root = candidates_root.resolve(strict=False)
        self.candidates_root.mkdir(parents=True, exist_ok=True)

    def create(self, *, candidate_id: str, base_ref: str = "HEAD") -> CandidateWorktree:
        if not candidate_id.replace("-", "").replace("_", "").isalnum():
            raise ValueError("invalid candidate id")
        path = (self.candidates_root / candidate_id).resolve(strict=False)
        if self.candidates_root not in path.parents:
            raise ValueError("candidate path escapes candidates root")
        if path.exists():
            raise FileExistsError(f"candidate worktree exists: {path}")
        completed = subprocess.run(
            ["git", "-C", str(self.repository), "worktree", "add", "--detach", str(path), base_ref],
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(f"git worktree add failed: {completed.stderr.strip()}")
        return CandidateWorktree(candidate_id=candidate_id, path=path, base_ref=base_ref)

    def write_candidate_manifest(self, handle: CandidateWorktree, manifest: dict[str, object]) -> Path:
        directory = handle.path / ".evoharness"
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / "candidate-manifest.json"
        path.write_text(
            json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
        return path

    def remove(self, handle: CandidateWorktree) -> None:
        expected = (self.candidates_root / handle.candidate_id).resolve(strict=False)
        if handle.path.resolve(strict=False) != expected:
            raise ValueError("refusing to remove an unexpected worktree path")
        completed = subprocess.run(
            ["git", "-C", str(self.repository), "worktree", "remove", "--force", str(expected)],
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(f"git worktree remove failed: {completed.stderr.strip()}")
