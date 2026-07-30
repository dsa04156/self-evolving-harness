import type { JsonValue } from "../core/canonical.js";

export type ComponentType =
  | "SystemPrompt"
  | "ToolDescription"
  | "ToolImplementation"
  | "ContextPolicy"
  | "MemoryRetrievalPolicy"
  | "Skill"
  | "WorkflowPolicy"
  | "RoutingPolicy"
  | "SubagentPrompt"
  | "RecoveryPolicy"
  | "VerificationPolicy"
  | "PermissionPolicy"
  | "SafetyPolicy"
  | "Evaluator"
  | "BenchmarkData"
  | "BudgetPolicy"
  | "ModelIdentity"
  | "TraceCollector"
  | "AuditPolicy"
  | "PromotionPolicy"
  | "Middleware"
  | "Optimizer";

export type MutableClass = "mutable" | "conditionally-mutable" | "immutable";

export interface ArtifactReference {
  readonly contentHash: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly redacted?: boolean;
}

export interface ComponentReference {
  readonly componentId: string;
  readonly componentManifestId: string;
  readonly typeEntryId: string;
  readonly semanticVersion: string;
  readonly manifestHash: string;
}

export interface ComponentManifest {
  readonly schemaVersion: 2;
  readonly componentManifestId: string;
  readonly identity: {
    readonly canonicalizationProfile: "seh-jcs-v1";
    readonly componentId: string;
    readonly semanticVersion: string;
    readonly typeRegistryRef: {
      readonly typeRegistryId: string;
      readonly typeRegistryHash: string;
      readonly typeEntryId: string;
    };
    readonly payload: {
      readonly language: string;
      readonly artifact: ArtifactReference;
      readonly capabilityDigest: string;
    };
    readonly dependencies: readonly {
      readonly relation: "requires" | "extends" | "uses_schema" | "uses_description";
      readonly component: ComponentReference;
    }[];
    readonly behaviorClosure: {
      readonly closureHash: string;
      readonly componentCount: number;
      readonly artifactCount: number;
      readonly canonicalBytes: number;
    };
  };
}

export interface HarnessVersionManifest {
  readonly schemaVersion: 2;
  readonly harnessVersionId: string;
  readonly manifestHash: string;
  readonly identity: {
    readonly canonicalizationProfile: "seh-jcs-v1";
    readonly semanticVersion: string;
    readonly requiredRuntimeContractHash: string;
    readonly typeRegistryId: string;
    readonly componentBindings: readonly {
      readonly slotId: string;
      readonly component: ComponentReference;
    }[];
    readonly behaviorClosure: {
      readonly closureHash: string;
      readonly componentCount: number;
      readonly artifactCount: number;
      readonly canonicalBytes: number;
    };
  };
}

export interface ComponentPayload {
  readonly language: string;
  readonly value: JsonValue;
}
