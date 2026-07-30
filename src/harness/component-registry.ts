import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  canonicalBytes,
  contentId,
  parseStrictJson,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import { HarnessError, assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import type {
  ArtifactReference,
  ComponentManifest,
  ComponentReference,
  HarnessVersionManifest,
  MutableClass,
} from "../domain/components.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type { ArtifactMediaType, ArtifactStore } from "../storage/artifact-store.js";

const TYPE_REGISTRY_SCHEMA = `${SCHEMA_BASE_URL}component-type-registry.schema.json`;
const COMPONENT_SCHEMA = `${SCHEMA_BASE_URL}harness-component.schema.json`;
const HARNESS_SCHEMA = `${SCHEMA_BASE_URL}harness-version.schema.json`;

const PAYLOAD_SCHEMAS: Readonly<Record<string, string>> = Object.freeze({
  "seh.prompt-markdown.v1": `${SCHEMA_BASE_URL}payloads/prompt-payload.schema.json`,
  "seh.context-policy.v1": `${SCHEMA_BASE_URL}payloads/context-policy-payload.schema.json`,
  "seh.memory-retrieval-policy.v1":
    `${SCHEMA_BASE_URL}payloads/memory-retrieval-policy-payload.schema.json`,
  "seh.skill.v1": `${SCHEMA_BASE_URL}payloads/skill-payload.schema.json`,
  "seh.workflow.v1": `${SCHEMA_BASE_URL}payloads/workflow-payload.schema.json`,
  "seh.routing-policy.v1": `${SCHEMA_BASE_URL}payloads/routing-policy-payload.schema.json`,
  "seh.tool-description.v1":
    `${SCHEMA_BASE_URL}payloads/tool-description-payload.schema.json`,
  "seh.policy-json.v1": `${SCHEMA_BASE_URL}payloads/policy-json-payload.schema.json`,
  "seh.immutable-artifact.v1":
    `${SCHEMA_BASE_URL}payloads/immutable-artifact-descriptor.schema.json`,
});

interface TypeRegistryEntry {
  readonly typeEntryId: string;
  readonly componentType: string;
  readonly mutableClass: MutableClass;
  readonly mvpMutationEnabled: boolean;
  readonly allowedPayloadLanguages: readonly string[];
  readonly payloadContractHash: string;
  readonly allowedDependencyTypeEntryIds: readonly string[];
  readonly allowedCapabilityIds: readonly string[];
  readonly candidateMayContainExecutableBytes: boolean;
}

interface ComponentTypeRegistry {
  readonly schemaVersion: 1;
  readonly typeRegistryId: string;
  readonly registryHash: string;
  readonly identity: {
    readonly canonicalizationProfile: "seh-jcs-v1";
    readonly registryVersion: string;
    readonly entries: readonly TypeRegistryEntry[];
  };
}

interface StoredComponent {
  readonly kind: "component";
  readonly manifest: ComponentManifest;
  readonly capabilityIds: readonly string[];
  readonly payload: JsonValue;
}

interface StoredHarness {
  readonly kind: "harness";
  readonly manifest: HarnessVersionManifest;
}

interface ClosureEntry {
  readonly componentIntrinsicId: string;
  readonly identityHash: string;
  readonly payloadHash: string;
  readonly dependencyIntrinsicIds: readonly string[];
}

interface ClosureDocument {
  readonly profile: "seh-jcs-v1";
  readonly components: readonly ClosureEntry[];
  readonly artifacts: readonly ArtifactReference[];
}

function asTypeRegistry(value: JsonValue): ComponentTypeRegistry {
  return value as unknown as ComponentTypeRegistry;
}

function asStoredComponent(value: JsonValue): StoredComponent {
  return value as unknown as StoredComponent;
}

function asStoredHarness(value: JsonValue): StoredHarness {
  return value as unknown as StoredHarness;
}

function mediaTypeFor(language: string): ArtifactMediaType {
  if (language === "seh.workflow.v1") return "application/vnd.seh.workflow+json";
  if (language === "seh.skill.v1") return "application/vnd.seh.skill+json";
  if (language === "seh.policy-json.v1") return "application/vnd.seh.policy+json";
  return "application/json";
}

function manifestHashFromComponentId(componentManifestId: string): string {
  assertCondition(
    componentManifestId.startsWith("cm-sha256:"),
    "SCHEMA_INVALID",
    "Bad component manifest ID",
  );
  return `sha256:${componentManifestId.slice("cm-sha256:".length)}`;
}

function componentReference(manifest: ComponentManifest): ComponentReference {
  return {
    componentId: manifest.identity.componentId,
    componentManifestId: manifest.componentManifestId,
    typeEntryId: manifest.identity.typeRegistryRef.typeEntryId,
    semanticVersion: manifest.identity.semanticVersion,
    manifestHash: manifestHashFromComponentId(manifest.componentManifestId),
  };
}

function intrinsicComponentIdentity(manifest: ComponentManifest): JsonValue {
  const { behaviorClosure: _closure, ...intrinsic } = manifest.identity;
  return intrinsic as unknown as JsonValue;
}

function sortedUnique(values: readonly string[], label: string): string[] {
  const sorted = [...values].sort();
  assertCondition(new Set(sorted).size === sorted.length, "SCHEMA_INVALID", `Duplicate ${label}`);
  return sorted;
}

export interface HarnessDiff {
  readonly changed: readonly {
    readonly slotId: string;
    readonly before: ComponentReference;
    readonly after: ComponentReference;
    readonly mutableClass: MutableClass;
    readonly mvpMutationEnabled: boolean;
  }[];
  readonly immutableDiffCount: number;
  readonly disabledConditionalDiffCount: number;
}

export class HarnessComponentRegistry {
  readonly #schemas: SchemaRegistry;
  readonly #artifacts: ArtifactStore;
  readonly #componentLog: AppendOnlyLog<JsonValue>;
  readonly #harnessLog: AppendOnlyLog<JsonValue>;
  readonly #requiredSlotIds: readonly string[];
  readonly #components = new Map<string, StoredComponent>();
  readonly #harnesses = new Map<string, StoredHarness>();
  readonly #types = new Map<string, TypeRegistryEntry>();
  #typeRegistry: ComponentTypeRegistry | null = null;

  public constructor(input: {
    root: string;
    schemas: SchemaRegistry;
    artifacts: ArtifactStore;
    requiredSlotIds?: readonly string[];
  }) {
    this.#schemas = input.schemas;
    this.#artifacts = input.artifacts;
    this.#componentLog = new AppendOnlyLog<JsonValue>(path.join(input.root, "logs"), "registry.components");
    this.#harnessLog = new AppendOnlyLog<JsonValue>(path.join(input.root, "logs"), "registry.harnesses");
    this.#requiredSlotIds = sortedUnique(input.requiredSlotIds ?? [], "required slot IDs");
  }

  public async initialize(typeRegistryPath: string): Promise<void> {
    const parsed = parseStrictJson(await readFile(typeRegistryPath, "utf8"));
    this.#schemas.validate(TYPE_REGISTRY_SCHEMA, parsed);
    const registry = asTypeRegistry(parsed);
    const digest = sha256(registry.identity);
    assertCondition(
      registry.registryHash === digest &&
        registry.typeRegistryId ===
          contentId("ctr-sha256", registry.identity as unknown as JsonValue),
      "HASH_MISMATCH",
      "Component type registry identity mismatch",
    );
    this.#typeRegistry = registry;
    for (const entry of registry.identity.entries) {
      assertCondition(!this.#types.has(entry.typeEntryId), "SCHEMA_INVALID", "Duplicate type entry");
      this.#types.set(entry.typeEntryId, entry);
    }
    await this.#artifacts.initialize();
    for (const record of await this.#componentLog.readAll()) {
      const stored = asStoredComponent(record.payload);
      assertCondition(stored.kind === "component", "HASH_MISMATCH", "Bad component log record");
      await this.#validateStoredComponent(stored);
      assertCondition(
        !this.#components.has(stored.manifest.componentManifestId),
        "CONFLICT",
        "Duplicate component registry record",
      );
      this.#components.set(stored.manifest.componentManifestId, stored);
    }
    for (const record of await this.#harnessLog.readAll()) {
      const stored = asStoredHarness(record.payload);
      assertCondition(stored.kind === "harness", "HASH_MISMATCH", "Bad harness log record");
      this.#validateHarnessManifest(stored.manifest);
      assertCondition(
        !this.#harnesses.has(stored.manifest.harnessVersionId),
        "CONFLICT",
        "Duplicate harness registry record",
      );
      this.#harnesses.set(stored.manifest.harnessVersionId, stored);
    }
  }

  public get typeRegistryId(): string {
    assertCondition(this.#typeRegistry !== null, "INTERNAL_ERROR", "Registry not initialized");
    return this.#typeRegistry.typeRegistryId;
  }

  public typeEntry(typeEntryId: string): TypeRegistryEntry {
    const entry = this.#types.get(typeEntryId);
    assertCondition(entry !== undefined, "SCHEMA_INVALID", `Unknown type entry ${typeEntryId}`);
    return entry;
  }

  public getComponent(componentManifestId: string): ComponentManifest {
    const stored = this.#components.get(componentManifestId);
    if (stored === undefined) {
      throw new HarnessError("ARTIFACT_UNAVAILABLE", `Missing component ${componentManifestId}`);
    }
    return stored.manifest;
  }

  public referenceFor(componentManifestId: string): ComponentReference {
    return componentReference(this.getComponent(componentManifestId));
  }

  public capabilitiesFor(componentManifestId: string): readonly string[] {
    const stored = this.#components.get(componentManifestId);
    if (stored === undefined) {
      throw new HarnessError("ARTIFACT_UNAVAILABLE", `Missing component ${componentManifestId}`);
    }
    return stored.capabilityIds;
  }

  public dependencyIdsFor(componentManifestId: string): readonly string[] {
    return this.getComponent(componentManifestId).identity.dependencies.map(
      (dependency) => dependency.component.componentManifestId,
    );
  }

  public async getPayload(componentManifestId: string): Promise<JsonValue> {
    const stored = this.#components.get(componentManifestId);
    if (stored === undefined) {
      throw new HarnessError("ARTIFACT_UNAVAILABLE", `Missing component ${componentManifestId}`);
    }
    await this.#artifacts.verify(stored.manifest.identity.payload.artifact);
    return stored.payload;
  }

  public getHarness(harnessVersionId: string): HarnessVersionManifest {
    const stored = this.#harnesses.get(harnessVersionId);
    if (stored === undefined) {
      throw new HarnessError("ARTIFACT_UNAVAILABLE", `Missing harness ${harnessVersionId}`);
    }
    return stored.manifest;
  }

  public async createComponent(input: {
    componentId: string;
    semanticVersion: string;
    typeEntryId: string;
    payloadLanguage: string;
    payload: JsonValue;
    capabilityIds: readonly string[];
    dependencyManifestIds?: readonly string[];
  }): Promise<ComponentManifest> {
    const registry = this.#requireTypeRegistry();
    const type = this.typeEntry(input.typeEntryId);
    assertCondition(
      type.allowedPayloadLanguages.includes(input.payloadLanguage),
      "AUTHORIZATION_DENIED",
      "Payload language is not allowed for this component type",
    );
    const payloadSchema = PAYLOAD_SCHEMAS[input.payloadLanguage];
    assertCondition(payloadSchema !== undefined, "SCHEMA_INVALID", "Unknown payload language");
    this.#schemas.validate(payloadSchema, input.payload);
    const capabilityIds = sortedUnique(input.capabilityIds, "capability IDs");
    assertCondition(
      capabilityIds.every((capability) => type.allowedCapabilityIds.includes(capability)),
      "AUTHORIZATION_DENIED",
      "Component requests an undeclared capability",
    );
    const artifact = await this.#artifacts.putJson(
      input.payload,
      mediaTypeFor(input.payloadLanguage),
    );
    const dependencyIds = sortedUnique(
      input.dependencyManifestIds ?? [],
      "component dependencies",
    );
    const dependencies = dependencyIds.map((dependencyId) => {
      const dependency = this.getComponent(dependencyId);
      assertCondition(
        type.allowedDependencyTypeEntryIds.includes(
          dependency.identity.typeRegistryRef.typeEntryId,
        ),
        "AUTHORIZATION_DENIED",
        `Dependency type is forbidden for ${type.typeEntryId}`,
      );
      return {
        relation: "requires" as const,
        component: componentReference(dependency),
      };
    });
    const intrinsic = {
      canonicalizationProfile: "seh-jcs-v1" as const,
      componentId: input.componentId,
      semanticVersion: input.semanticVersion,
      typeRegistryRef: {
        typeRegistryId: registry.typeRegistryId,
        typeRegistryHash: registry.registryHash,
        typeEntryId: input.typeEntryId,
      },
      payload: {
        language: input.payloadLanguage,
        artifact,
        capabilityDigest: sha256({ capabilityIds }),
      },
      dependencies,
    };
    const provisional = {
      schemaVersion: 2 as const,
      componentManifestId: "cm-sha256:".padEnd(74, "0"),
      identity: {
        ...intrinsic,
        behaviorClosure: {
          closureHash: "sha256:".padEnd(71, "0"),
          componentCount: 1,
          artifactCount: 1,
          canonicalBytes: 1,
        },
      },
    } satisfies ComponentManifest;
    const closure = this.#componentClosure(provisional, artifact);
    const identity: ComponentManifest["identity"] = {
      ...intrinsic,
      behaviorClosure: {
        closureHash: sha256(closure.document),
        componentCount: closure.document.components.length,
        artifactCount: closure.document.artifacts.length,
        canonicalBytes: closure.canonicalBytes,
      },
    };
    const manifest: ComponentManifest = {
      schemaVersion: 2,
      componentManifestId: contentId("cm-sha256", identity),
      identity,
    };
    this.#schemas.validate(COMPONENT_SCHEMA, manifest as unknown as JsonValue);
    const stored: StoredComponent = {
      kind: "component",
      manifest,
      capabilityIds,
      payload: input.payload,
    };
    await this.#validateStoredComponent(stored);
    const existing = this.#components.get(manifest.componentManifestId);
    if (existing !== undefined) return existing.manifest;
    await this.#componentLog.append(stored as unknown as JsonValue);
    this.#components.set(manifest.componentManifestId, stored);
    return manifest;
  }

  public async createHarness(input: {
    semanticVersion: string;
    requiredRuntimeContractHash: string;
    bindings: readonly { readonly slotId: string; readonly componentManifestId: string }[];
  }): Promise<HarnessVersionManifest> {
    const bindings = [...input.bindings].sort((left, right) =>
      left.slotId.localeCompare(right.slotId),
    );
    assertCondition(
      new Set(bindings.map((binding) => binding.slotId)).size === bindings.length,
      "SCHEMA_INVALID",
      "Duplicate harness slot",
    );
    if (this.#requiredSlotIds.length > 0) {
      assertCondition(
        JSON.stringify(bindings.map((binding) => binding.slotId)) ===
          JSON.stringify(this.#requiredSlotIds),
        "SCHEMA_INVALID",
        "Harness does not bind the exact required slot set",
      );
    }
    const componentBindings = bindings.map((binding) => ({
      slotId: binding.slotId,
      component: componentReference(this.getComponent(binding.componentManifestId)),
    }));
    const closure = this.#closureForManifests(
      componentBindings.map((binding) => this.getComponent(binding.component.componentManifestId)),
    );
    const identity: HarnessVersionManifest["identity"] = {
      canonicalizationProfile: "seh-jcs-v1",
      semanticVersion: input.semanticVersion,
      requiredRuntimeContractHash: input.requiredRuntimeContractHash,
      typeRegistryId: this.typeRegistryId,
      componentBindings,
      behaviorClosure: {
        closureHash: sha256(closure.document),
        componentCount: closure.document.components.length,
        artifactCount: closure.document.artifacts.length,
        canonicalBytes: closure.canonicalBytes,
      },
    };
    const harnessVersionId = contentId("hv-sha256", identity);
    const manifest: HarnessVersionManifest = {
      schemaVersion: 2,
      harnessVersionId,
      manifestHash: `sha256:${harnessVersionId.slice("hv-sha256:".length)}`,
      identity,
    };
    this.#validateHarnessManifest(manifest);
    const existing = this.#harnesses.get(manifest.harnessVersionId);
    if (existing !== undefined) return existing.manifest;
    const stored: StoredHarness = { kind: "harness", manifest };
    await this.#harnessLog.append(stored as unknown as JsonValue);
    this.#harnesses.set(manifest.harnessVersionId, stored);
    return manifest;
  }

  public diffHarnesses(parentId: string, candidateId: string): HarnessDiff {
    const parent = this.getHarness(parentId);
    const candidate = this.getHarness(candidateId);
    const parentBySlot = new Map(
      parent.identity.componentBindings.map((binding) => [binding.slotId, binding.component]),
    );
    const candidateBySlot = new Map(
      candidate.identity.componentBindings.map((binding) => [binding.slotId, binding.component]),
    );
    assertCondition(
      parentBySlot.size === candidateBySlot.size &&
        [...parentBySlot.keys()].every((slot) => candidateBySlot.has(slot)),
      "AUTHORIZATION_DENIED",
      "Candidate changed the harness slot set",
    );
    const changed: HarnessDiff["changed"][number][] = [];
    for (const [slotId, before] of [...parentBySlot.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const after = candidateBySlot.get(slotId)!;
      if (before.componentManifestId === after.componentManifestId) continue;
      assertCondition(
        before.componentId === after.componentId && before.typeEntryId === after.typeEntryId,
        "AUTHORIZATION_DENIED",
        "Candidate replaced a stable component family or type",
      );
      const type = this.typeEntry(before.typeEntryId);
      changed.push({
        slotId,
        before,
        after,
        mutableClass: type.mutableClass,
        mvpMutationEnabled: type.mvpMutationEnabled,
      });
    }
    return {
      changed,
      immutableDiffCount: changed.filter((entry) => entry.mutableClass === "immutable").length,
      disabledConditionalDiffCount: changed.filter(
        (entry) => entry.mutableClass === "conditionally-mutable" && !entry.mvpMutationEnabled,
      ).length,
    };
  }

  async #validateStoredComponent(stored: StoredComponent): Promise<void> {
    const manifest = stored.manifest;
    this.#schemas.validate(COMPONENT_SCHEMA, manifest as unknown as JsonValue);
    assertCondition(
      manifest.componentManifestId === contentId("cm-sha256", manifest.identity),
      "HASH_MISMATCH",
      "Component manifest identity mismatch",
    );
    const type = this.typeEntry(manifest.identity.typeRegistryRef.typeEntryId);
    assertCondition(
      manifest.identity.typeRegistryRef.typeRegistryId === this.typeRegistryId,
      "PROTOCOL_MISMATCH",
      "Component uses another type registry",
    );
    assertCondition(
      type.allowedPayloadLanguages.includes(manifest.identity.payload.language),
      "AUTHORIZATION_DENIED",
      "Stored component payload language is forbidden",
    );
    const payloadSchema = PAYLOAD_SCHEMAS[manifest.identity.payload.language];
    assertCondition(payloadSchema !== undefined, "SCHEMA_INVALID", "Unknown payload contract");
    this.#schemas.validate(payloadSchema, stored.payload);
    assertCondition(
      manifest.identity.payload.capabilityDigest ===
        sha256({ capabilityIds: sortedUnique(stored.capabilityIds, "capability IDs") }),
      "HASH_MISMATCH",
      "Capability digest mismatch",
    );
    assertCondition(
      stored.capabilityIds.every((capability) => type.allowedCapabilityIds.includes(capability)),
      "AUTHORIZATION_DENIED",
      "Stored component has a forbidden capability",
    );
    await this.#artifacts.verify(manifest.identity.payload.artifact);
    const bytes = await this.#artifacts.get(manifest.identity.payload.artifact.contentHash);
    assertCondition(
      Buffer.compare(bytes, canonicalBytes(stored.payload)) === 0,
      "HASH_MISMATCH",
      "Stored payload does not match its artifact",
    );
    for (const dependency of manifest.identity.dependencies) {
      const resolved = this.getComponent(dependency.component.componentManifestId);
      assertCondition(
        sha256(componentReference(resolved)) === sha256(dependency.component),
        "HASH_MISMATCH",
        "Component dependency reference mismatch",
      );
      assertCondition(
        type.allowedDependencyTypeEntryIds.includes(resolved.identity.typeRegistryRef.typeEntryId),
        "AUTHORIZATION_DENIED",
        "Component dependency type is forbidden",
      );
    }
    const closure = this.#componentClosure(manifest, manifest.identity.payload.artifact);
    assertCondition(
      manifest.identity.behaviorClosure.closureHash === sha256(closure.document) &&
        manifest.identity.behaviorClosure.componentCount === closure.document.components.length &&
        manifest.identity.behaviorClosure.artifactCount === closure.document.artifacts.length &&
        manifest.identity.behaviorClosure.canonicalBytes === closure.canonicalBytes,
      "HASH_MISMATCH",
      "Component behavior closure mismatch",
    );
  }

  #validateHarnessManifest(manifest: HarnessVersionManifest): void {
    this.#schemas.validate(HARNESS_SCHEMA, manifest as unknown as JsonValue);
    const expectedId = contentId("hv-sha256", manifest.identity);
    assertCondition(
      manifest.harnessVersionId === expectedId &&
        manifest.manifestHash === `sha256:${expectedId.slice("hv-sha256:".length)}`,
      "HASH_MISMATCH",
      "Harness manifest identity mismatch",
    );
    assertCondition(
      manifest.identity.typeRegistryId === this.typeRegistryId,
      "PROTOCOL_MISMATCH",
      "Harness uses another type registry",
    );
    const slots = manifest.identity.componentBindings.map((binding) => binding.slotId);
    assertCondition(
      JSON.stringify(slots) === JSON.stringify([...slots].sort()) &&
        new Set(slots).size === slots.length,
      "SCHEMA_INVALID",
      "Harness bindings are not uniquely sorted",
    );
    for (const binding of manifest.identity.componentBindings) {
      assertCondition(
        sha256(componentReference(this.getComponent(binding.component.componentManifestId))) ===
          sha256(binding.component),
        "HASH_MISMATCH",
        "Harness component reference mismatch",
      );
    }
    const closure = this.#closureForManifests(
      manifest.identity.componentBindings.map((binding) =>
        this.getComponent(binding.component.componentManifestId),
      ),
    );
    assertCondition(
      manifest.identity.behaviorClosure.closureHash === sha256(closure.document) &&
        manifest.identity.behaviorClosure.componentCount === closure.document.components.length &&
        manifest.identity.behaviorClosure.artifactCount === closure.document.artifacts.length &&
        manifest.identity.behaviorClosure.canonicalBytes === closure.canonicalBytes,
      "HASH_MISMATCH",
      "Harness behavior closure mismatch",
    );
  }

  #componentClosure(
    root: ComponentManifest,
    rootArtifact: ArtifactReference,
  ): { readonly document: ClosureDocument; readonly canonicalBytes: number } {
    const closure = this.#closureForManifests([root]);
    assertCondition(
      closure.document.artifacts.some(
        (artifact) => artifact.contentHash === rootArtifact.contentHash,
      ),
      "HASH_MISMATCH",
      "Root artifact missing from behavior closure",
    );
    return closure;
  }

  #closureForManifests(
    roots: readonly ComponentManifest[],
  ): { readonly document: ClosureDocument; readonly canonicalBytes: number } {
    const manifests = new Map<string, ComponentManifest>();
    const visiting = new Set<string>();
    const visit = (manifest: ComponentManifest): void => {
      if (manifests.has(manifest.componentManifestId)) return;
      assertCondition(
        !visiting.has(manifest.componentManifestId),
        "SCHEMA_INVALID",
        "Component dependency cycle",
      );
      visiting.add(manifest.componentManifestId);
      for (const dependency of manifest.identity.dependencies) {
        visit(this.getComponent(dependency.component.componentManifestId));
      }
      visiting.delete(manifest.componentManifestId);
      manifests.set(manifest.componentManifestId, manifest);
    };
    roots.forEach(visit);
    const components: ClosureEntry[] = [...manifests.values()]
      .map((manifest) => ({
        // The full manifest ID contains behaviorClosure. Both the closure node ID and
        // identity hash therefore use identity-minus-behaviorClosure; using the final
        // manifest ID here would create an unsatisfiable fixed-point hash cycle.
        componentIntrinsicId: contentId(
          "cm-sha256",
          intrinsicComponentIdentity(manifest),
        ),
        identityHash: sha256(intrinsicComponentIdentity(manifest)),
        payloadHash: manifest.identity.payload.artifact.contentHash,
        dependencyIntrinsicIds: manifest.identity.dependencies
          .map((dependency) =>
            contentId(
              "cm-sha256",
              intrinsicComponentIdentity(
                this.getComponent(dependency.component.componentManifestId),
              ),
            ),
          )
          .sort(),
      }))
      .sort((left, right) =>
        left.componentIntrinsicId.localeCompare(right.componentIntrinsicId),
      );
    const artifacts = [...manifests.values()]
      .map((manifest) => manifest.identity.payload.artifact)
      .filter(
        (artifact, index, all) =>
          all.findIndex((candidate) => candidate.contentHash === artifact.contentHash) === index,
      )
      .sort((left, right) => left.contentHash.localeCompare(right.contentHash));
    const document: ClosureDocument = {
      profile: "seh-jcs-v1",
      components,
      artifacts,
    };
    const canonicalSize =
      canonicalBytes(document).byteLength +
      artifacts.reduce((sum, artifact) => sum + artifact.sizeBytes, 0);
    return { document, canonicalBytes: canonicalSize };
  }

  #requireTypeRegistry(): ComponentTypeRegistry {
    assertCondition(this.#typeRegistry !== null, "INTERNAL_ERROR", "Registry not initialized");
    return this.#typeRegistry;
  }
}
