# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re


@dataclass(frozen=True, slots=True)
class SkillDocument:
    name: str
    description: str
    content: str
    path: Path


class SkillRegistry:
    """Loads explicit SKILL.md documents; skills do not execute arbitrary code."""

    def __init__(self, roots: tuple[Path, ...]) -> None:
        self.roots = roots
        self._skills: dict[str, SkillDocument] = {}

    def discover(self) -> tuple[SkillDocument, ...]:
        discovered: dict[str, SkillDocument] = {}
        for root in self.roots:
            if not root.exists():
                continue
            for path in sorted(root.glob("*/SKILL.md")):
                document = self._parse(path)
                if document.name in discovered:
                    raise ValueError(f"duplicate skill name: {document.name}")
                discovered[document.name] = document
        self._skills = discovered
        return tuple(discovered.values())

    def get(self, name: str) -> SkillDocument:
        if not self._skills:
            self.discover()
        try:
            return self._skills[name]
        except KeyError as exc:
            raise KeyError(f"unknown skill: {name}") from exc

    @staticmethod
    def _parse(path: Path) -> SkillDocument:
        content = path.read_text(encoding="utf-8")
        name = path.parent.name
        description = ""
        if content.startswith("---\n"):
            end = content.find("\n---\n", 4)
            if end != -1:
                frontmatter = content[4:end]
                name_match = re.search(r"^name:\s*[\"']?(.+?)[\"']?\s*$", frontmatter, flags=re.MULTILINE)
                description_match = re.search(
                    r"^description:\s*[\"']?(.+?)[\"']?\s*$", frontmatter, flags=re.MULTILINE
                )
                if name_match:
                    name = name_match.group(1)
                if description_match:
                    description = description_match.group(1)
        return SkillDocument(name=name, description=description, content=content, path=path)
