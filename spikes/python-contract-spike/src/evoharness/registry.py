# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
from __future__ import annotations

from dataclasses import asdict, replace
from pathlib import Path
import json
import os
import re
from typing import Any, Iterable

from .models import (
    ComponentType,
    ComponentVersion,
    HarnessVersion,
    HarnessVersionState,
    MutableClass,
    Provenance,
)
from .state import harness_machine


SAFE_ID = re.compile(r"^[A-Za-z0-9_.-]+$")


def _check_id(value: str, label: str) -> None:
    if not SAFE_ID.fullmatch(value):
        raise ValueError(f"invalid {label}: {value!r}")


def _write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, default=str) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


class HarnessRegistry:
    """Content-addressed component graph and immutable HarnessVersion manifests."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.components_root = root / "components"
        self.versions_root = root / "versions"
        self.pointers_root = root / "pointers"
        for path in (self.components_root, self.versions_root, self.pointers_root):
            path.mkdir(parents=True, exist_ok=True)

    def _component_path(self, component: ComponentVersion) -> Path:
        _check_id(component.component_id, "component id")
        _check_id(component.semantic_version, "semantic version")
        return (
            self.components_root
            / component.component_id
            / f"{component.semantic_version}-{component.content_hash}.json"
        )

    def register_component(self, component: ComponentVersion) -> ComponentVersion:
        existing = self.list_component_versions(component.component_id)
        if any(
            item.mutable_class == MutableClass.IMMUTABLE and item.content_hash != component.content_hash
            for item in existing
        ):
            raise PermissionError(f"immutable component cannot change: {component.component_id}")
        path = self._component_path(component)
        if not path.exists():
            _write_json_atomic(path, asdict(component))
        return component

    def list_component_versions(self, component_id: str) -> tuple[ComponentVersion, ...]:
        _check_id(component_id, "component id")
        directory = self.components_root / component_id
        if not directory.exists():
            return ()
        return tuple(self._load_component_file(path) for path in sorted(directory.glob("*.json")))

    def _load_component_file(self, path: Path) -> ComponentVersion:
        data = json.loads(path.read_text(encoding="utf-8"))
        data["component_type"] = ComponentType(data["component_type"])
        data["mutable_class"] = MutableClass(data["mutable_class"])
        data["dependencies"] = tuple(data.get("dependencies", ()))
        data["evaluation_history"] = tuple(data.get("evaluation_history", ()))
        provenance = data["provenance"]
        provenance["parent_hashes"] = tuple(provenance.get("parent_hashes", ()))
        data["provenance"] = Provenance(**provenance)
        active_hash_path = self.pointers_root / f"component-{data['component_id']}.txt"
        active_hash = active_hash_path.read_text(encoding="utf-8").strip() if active_hash_path.exists() else ""
        data["active_version"] = data["content_hash"] == active_hash
        return ComponentVersion(**data)

    def component_by_hash(self, component_id: str, wanted_hash: str) -> ComponentVersion:
        for component in self.list_component_versions(component_id):
            if component.content_hash == wanted_hash:
                return component
        raise KeyError(f"component hash not found: {component_id}@{wanted_hash}")

    def set_active_component(self, component_id: str, wanted_hash: str) -> None:
        self.component_by_hash(component_id, wanted_hash)
        _write_json_atomic(
            self.pointers_root / f"component-{component_id}.json",
            {"component_id": component_id, "content_hash": wanted_hash},
        )
        (self.pointers_root / f"component-{component_id}.txt").write_text(
            wanted_hash + "\n", encoding="utf-8"
        )

    def register_version(self, version: HarnessVersion) -> HarnessVersion:
        _check_id(version.harness_version_id, "harness version id")
        path = self.versions_root / f"{version.harness_version_id}.json"
        if path.exists():
            raise FileExistsError(f"harness version already exists: {version.harness_version_id}")
        self.validate_graph(version.component_refs)
        _write_json_atomic(path, asdict(version))
        return version

    def load_version(self, version_id: str) -> HarnessVersion:
        _check_id(version_id, "harness version id")
        data = json.loads((self.versions_root / f"{version_id}.json").read_text(encoding="utf-8"))
        data["state"] = HarnessVersionState(data["state"])
        data["evaluation_history"] = tuple(data.get("evaluation_history", ()))
        return HarnessVersion(**data)

    def save_version_metadata(self, version: HarnessVersion) -> None:
        existing = self.load_version(version.harness_version_id)
        if (
            existing.manifest_hash != version.manifest_hash
            or existing.component_refs != version.component_refs
            or existing.parent_version_id != version.parent_version_id
        ):
            raise PermissionError("HarnessVersion manifest is immutable after registration")
        _write_json_atomic(self.versions_root / f"{version.harness_version_id}.json", asdict(version))

    def transition_version(
        self,
        version_id: str,
        target: HarnessVersionState,
        *,
        evaluation_id: str | None = None,
    ) -> HarnessVersion:
        version = self.load_version(version_id)
        machine = harness_machine(version.state)
        machine.transition(target)
        history = version.evaluation_history
        if evaluation_id:
            history = (*history, evaluation_id)
        updated = replace(version, state=machine.state, evaluation_history=history)
        self.save_version_metadata(updated)
        return updated

    def validate_graph(self, component_refs: dict[str, str]) -> None:
        components = {
            component_id: self.component_by_hash(component_id, wanted_hash)
            for component_id, wanted_hash in component_refs.items()
        }
        for component in components.values():
            missing = set(component.dependencies) - set(components)
            if missing:
                raise ValueError(
                    f"component {component.component_id} has missing dependencies: {sorted(missing)}"
                )

    def active_version_id(self) -> str | None:
        path = self.pointers_root / "active-harness.txt"
        return path.read_text(encoding="utf-8").strip() if path.exists() else None

    def activate(self, version_id: str) -> None:
        version = self.load_version(version_id)
        if version.state != HarnessVersionState.ACTIVE:
            raise ValueError("only an active-lifecycle version may become the registry pointer")
        (self.pointers_root / "active-harness.txt").write_text(version_id + "\n", encoding="utf-8")
        for component_id, wanted_hash in version.component_refs.items():
            self.set_active_component(component_id, wanted_hash)

    def component_contents(self, version_id: str) -> dict[str, Any]:
        version = self.load_version(version_id)
        return {
            component_id: self.component_by_hash(component_id, wanted_hash).content
            for component_id, wanted_hash in version.component_refs.items()
        }

    def all_versions(self) -> tuple[HarnessVersion, ...]:
        return tuple(
            self.load_version(path.stem) for path in sorted(self.versions_root.glob("*.json"))
        )


def bump_patch(semantic_version: str) -> str:
    parts = semantic_version.split(".")
    if len(parts) != 3 or not all(part.isdigit() for part in parts):
        raise ValueError(f"semantic version must be MAJOR.MINOR.PATCH: {semantic_version}")
    major, minor, patch = (int(part) for part in parts)
    return f"{major}.{minor}.{patch + 1}"
