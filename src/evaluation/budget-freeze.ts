import path from "node:path";

import { sha256, type JsonValue } from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type {
  Attestation,
  PrincipalIdentity,
  PrincipalRegistry,
  PrincipalSigner,
} from "../trust/identity.js";

export const BUDGET_FREEZE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}budget-freeze-manifest.schema.json`;

export const METHOD_IDS = [
  "B0",
  "B1",
  "B2",
  "B3",
  "B4",
  "B5-U",
  "B5-SM",
  "B6-ABL",
  "B6-RAW",
  "B6",
] as const;

export type MethodId = (typeof METHOD_IDS)[number];

export const TRACK_A_MATCHED_METHODS = [
  "B1",
  "B2",
  "B3",
  "B4",
  "B5-U",
  "B5-SM",
  "B6-ABL",
  "B6",
] as const satisfies readonly MethodId[];

export const PHASE_IDS = [
  "mine_trace_generation",
  "evidence_summarization",
  "weakness_mining",
  "attribution",
  "proposal",
  "static_validation",
  "gate_evaluation",
  "gate_selection",
  "offline_canary",
  "track_a_task_search",
  "final_solving",
  "temporal_replication",
  "provider_smoke",
] as const;

export type EvaluationPhaseId = (typeof PHASE_IDS)[number];

export interface PhaseBudgetCaps {
  readonly providerModelRequestAttempts: number;
  readonly totalChargedTokens: number;
  readonly providerCostMicros: number;
  readonly toolAttempts: number;
  readonly feedbackEvents: number;
  readonly wallClockMillis: number;
  readonly processCount: number;
  readonly outputBytes: number;
}

export interface BudgetFreezeCore {
  readonly schemaVersion: 1;
  readonly hashDomain: "BudgetFreezeManifest.v1";
  readonly protocolId: string;
  readonly scope:
    | "synthetic_gate3_readiness"
    | "provider_smoke"
    | "pilot";
  readonly datasetPermissions: readonly string[];
  readonly modelIdentityHash: string;
  readonly toolSetHash: string;
  readonly environmentHash: string;
  readonly permissionPolicyHash: string;
  readonly methods: readonly MethodId[];
  readonly rolloutSeeds: readonly number[];
  readonly solverSlots: readonly {
    readonly methodId: MethodId;
    readonly slots: number;
  }[];
  readonly phaseCaps: readonly {
    readonly phaseId: EvaluationPhaseId;
    readonly caps: PhaseBudgetCaps;
  }[];
  readonly perRequestTokenCap: number;
  readonly perRequestCostCapMicros: number;
  readonly sourceConfigHash: string;
  readonly supersedesBudgetFreezeId: string | null;
  readonly createdAt: string;
  readonly createdBy: PrincipalIdentity;
}

export interface BudgetFreezeManifest extends BudgetFreezeCore {
  readonly budgetFreezeId: string;
  readonly attestation: Attestation;
}

type BudgetFreezeBody = Omit<BudgetFreezeManifest, "attestation">;

function coreOf(manifest: BudgetFreezeManifest): BudgetFreezeCore {
  const {
    budgetFreezeId: _budgetFreezeId,
    attestation: _attestation,
    ...core
  } = manifest;
  return core;
}

function bodyOf(manifest: BudgetFreezeManifest): BudgetFreezeBody {
  const { attestation: _attestation, ...body } = manifest;
  return body;
}

function assertIntegerRecord(
  record: Readonly<Record<string, number>>,
  label: string,
): void {
  for (const [name, value] of Object.entries(record)) {
    assertCondition(
      Number.isSafeInteger(value) && value >= 0,
      "SCHEMA_INVALID",
      `${label}.${name} must be a nonnegative safe integer`,
    );
  }
}

function assertOrderedSubset<T extends string>(
  actual: readonly T[],
  canonical: readonly T[],
  label: string,
): void {
  const expected = canonical.filter((value) => actual.includes(value));
  assertCondition(
    actual.length > 0 &&
      actual.length === new Set(actual).size &&
      actual.every((value, index) => value === expected[index]),
    "SCHEMA_INVALID",
    `${label} must be unique and in canonical order`,
  );
}

export function assertBudgetFreezeContract(
  manifest: BudgetFreezeCore,
): void {
  assertOrderedSubset(manifest.methods, METHOD_IDS, "methods");
  assertOrderedSubset(
    manifest.phaseCaps.map((entry) => entry.phaseId),
    PHASE_IDS,
    "phaseCaps",
  );
  assertCondition(
    manifest.rolloutSeeds.length > 0 &&
      manifest.rolloutSeeds.length ===
        new Set(manifest.rolloutSeeds).size &&
      manifest.rolloutSeeds.every(
        (seed) => Number.isSafeInteger(seed) && seed >= 0,
      ),
    "SCHEMA_INVALID",
    "Rollout seeds must be nonnegative, unique safe integers",
  );
  assertCondition(
    manifest.solverSlots.length === manifest.methods.length &&
      manifest.solverSlots.every(
        (entry, index) =>
          entry.methodId === manifest.methods[index] &&
          Number.isSafeInteger(entry.slots) &&
          entry.slots >= 1,
      ),
    "SCHEMA_INVALID",
    "Solver slots must cover methods in canonical order",
  );
  const b0 = manifest.solverSlots.find(
    (entry) => entry.methodId === "B0",
  );
  if (b0 !== undefined) {
    assertCondition(
      b0.slots === 1,
      "SCHEMA_INVALID",
      "B0 must remain a one-slot anchor",
    );
  }
  const matchedSlots = manifest.solverSlots
    .filter((entry) =>
      (TRACK_A_MATCHED_METHODS as readonly MethodId[]).includes(
        entry.methodId,
      ),
    )
    .map((entry) => entry.slots);
  assertCondition(
    matchedSlots.length === 0 ||
      new Set(matchedSlots).size === 1,
    "SCHEMA_INVALID",
    "Track A matched methods must have the same solver-slot ceiling",
  );
  const requiredSeedCount = Math.max(
    ...manifest.solverSlots.map((entry) => entry.slots),
  );
  assertCondition(
    manifest.rolloutSeeds.length >= requiredSeedCount,
    "SCHEMA_INVALID",
    "The freeze does not contain enough rollout seeds for its slot ceiling",
  );
  for (const entry of manifest.phaseCaps) {
    assertIntegerRecord(
      entry.caps as unknown as Readonly<Record<string, number>>,
      `phaseCaps.${entry.phaseId}`,
    );
  }
  assertCondition(
    Number.isSafeInteger(manifest.perRequestTokenCap) &&
      manifest.perRequestTokenCap >= 1,
    "SCHEMA_INVALID",
    "Per-request token cap must be a positive safe integer",
  );
  assertCondition(
    Number.isSafeInteger(manifest.perRequestCostCapMicros) &&
      manifest.perRequestCostCapMicros >= 0,
    "SCHEMA_INVALID",
    "Per-request cost cap must be a nonnegative safe integer",
  );
  if (manifest.scope !== "pilot") {
    assertCondition(
      manifest.datasetPermissions.length === 1 &&
        manifest.datasetPermissions[0] === "deterministic",
      "AUTHORIZATION_DENIED",
      "Pre-pilot freezes may access deterministic synthetic data only",
    );
  }
}

export function createBudgetFreezeManifest(input: {
  readonly core: Omit<
    BudgetFreezeCore,
    "schemaVersion" | "hashDomain" | "createdBy"
  >;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): BudgetFreezeManifest {
  assertCondition(
    input.signer.identity.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    "Only the protocol author can freeze evaluation budgets",
  );
  const core: BudgetFreezeCore = {
    schemaVersion: 1,
    hashDomain: "BudgetFreezeManifest.v1",
    ...input.core,
    createdBy: input.signer.identity,
  };
  assertBudgetFreezeContract(core);
  const digest = sha256(core as unknown as JsonValue).slice(7);
  const body: BudgetFreezeBody = {
    ...core,
    budgetFreezeId: `bf-sha256:${digest}`,
  };
  const manifest: BudgetFreezeManifest = {
    ...body,
    attestation: input.signer.attest(body as unknown as JsonValue),
  };
  input.schemas.validate(
    BUDGET_FREEZE_SCHEMA_ID,
    manifest as unknown as JsonValue,
  );
  return manifest;
}

export function verifyBudgetFreezeManifest(input: {
  readonly manifest: BudgetFreezeManifest;
  readonly expectedProtocolId: string;
  readonly schemas: SchemaRegistry;
  readonly principals: PrincipalRegistry;
}): void {
  input.schemas.validate(
    BUDGET_FREEZE_SCHEMA_ID,
    input.manifest as unknown as JsonValue,
  );
  assertBudgetFreezeContract(input.manifest);
  assertCondition(
    input.manifest.protocolId === input.expectedProtocolId,
    "PROTOCOL_MISMATCH",
    "Budget freeze belongs to another protocol",
  );
  assertCondition(
    input.manifest.createdBy.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    "Budget freeze creator is not the protocol author",
  );
  assertCondition(
    input.manifest.budgetFreezeId ===
      `bf-sha256:${sha256(coreOf(input.manifest) as unknown as JsonValue).slice(7)}`,
    "HASH_MISMATCH",
    "Budget freeze content identity mismatch",
  );
  input.principals.verify(
    input.manifest.createdBy,
    bodyOf(input.manifest) as unknown as JsonValue,
    input.manifest.attestation,
  );
}

export class BudgetFreezeStore {
  readonly #protocolId: string;
  readonly #schemas: SchemaRegistry;
  readonly #principals: PrincipalRegistry;
  readonly #signer: PrincipalSigner;
  readonly #log: AppendOnlyLog<JsonValue>;
  #active: BudgetFreezeManifest | null = null;

  public constructor(input: {
    readonly root: string;
    readonly protocolId: string;
    readonly schemas: SchemaRegistry;
    readonly principals: PrincipalRegistry;
    readonly signer: PrincipalSigner;
  }) {
    this.#protocolId = input.protocolId;
    this.#schemas = input.schemas;
    this.#principals = input.principals;
    this.#signer = input.signer;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "trust"),
      `budget-freeze.${input.protocolId}`,
    );
  }

  public async initialize(): Promise<void> {
    const records = await this.#log.readAll();
    assertCondition(
      records.length <= 1,
      "PROTOCOL_MISMATCH",
      "A protocol cannot contain multiple budget freezes",
    );
    if (records.length === 0) return;
    const manifest =
      records[0]!.payload as unknown as BudgetFreezeManifest;
    verifyBudgetFreezeManifest({
      manifest,
      expectedProtocolId: this.#protocolId,
      schemas: this.#schemas,
      principals: this.#principals,
    });
    this.#active = manifest;
  }

  public async freeze(
    core: Omit<
      BudgetFreezeCore,
      "schemaVersion" | "hashDomain" | "createdBy"
    >,
  ): Promise<BudgetFreezeManifest> {
    const candidate = createBudgetFreezeManifest({
      core,
      signer: this.#signer,
      schemas: this.#schemas,
    });
    if (this.#active !== null) {
      assertCondition(
        this.#active.budgetFreezeId === candidate.budgetFreezeId,
        "PROTOCOL_MISMATCH",
        "Changing frozen budget bytes requires a new protocol ID",
      );
      return this.#active;
    }
    await this.#log.append(candidate as unknown as JsonValue);
    this.#active = candidate;
    return candidate;
  }

  public active(): BudgetFreezeManifest {
    assertCondition(
      this.#active !== null,
      "ARTIFACT_UNAVAILABLE",
      "No budget freeze is active for this protocol",
    );
    return this.#active;
  }
}
