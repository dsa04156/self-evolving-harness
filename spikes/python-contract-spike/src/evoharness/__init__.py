# NON-AUTHORITATIVE PRE-CONTRACT SPIKE; DO NOT PACKAGE OR IMPORT.
"""Standalone coding-agent runtime and bounded harness evolution system."""

from .models import (
    AttributionResult,
    Budget,
    ComponentType,
    EvaluationResult,
    EvidenceReceipt,
    FailurePattern,
    HarnessVersion,
    HarnessVersionState,
    MutableClass,
    MutationProposal,
    PromotionDecision,
    RuntimeEvent,
    SessionState,
)

__all__ = [
    "AttributionResult",
    "Budget",
    "ComponentType",
    "EvaluationResult",
    "EvidenceReceipt",
    "FailurePattern",
    "HarnessVersion",
    "HarnessVersionState",
    "MutableClass",
    "MutationProposal",
    "PromotionDecision",
    "RuntimeEvent",
    "SessionState",
]

__version__ = "0.1.0"
