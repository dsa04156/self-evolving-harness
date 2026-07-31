import path from "node:path";

import {
  canonicalize,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import {
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalSigner,
  type PublicPrincipal,
} from "../trust/identity.js";

export const NON_PROMOTABLE_HARNESS_RECORD_SCHEMA_ID =
  `${SCHEMA_BASE_URL}non-promotable-harness-record.schema.json`;

export const NON_PROMOTABLE_DESTINATIONS = [
  "harness_qualification_lifecycle",
  "research_selection",
  "canary",
  "approved",
  "deployment",
  "production_pointer",
  "research_manifest",
] as const;

export interface NonPromotableHarnessRecord {
  readonly schemaVersion: 1;
  readonly recordId: string;
  readonly recordType: "non_promotable_harness";
  readonly harnessVersionId: string;
  readonly reason:
    "development_attribution_mutation_dry_run";
  readonly developmentOnly: true;
  readonly promotable: false;
  readonly authorizedForResearchEvidence: false;
  readonly forbiddenDestinations:
    typeof NON_PROMOTABLE_DESTINATIONS;
  readonly recordedAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

type RecordCore = Omit<
  NonPromotableHarnessRecord,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type SignedBody = Omit<
  NonPromotableHarnessRecord,
  "attestation"
>;

function coreOf(
  record: NonPromotableHarnessRecord,
): RecordCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function signedBodyOf(
  record: NonPromotableHarnessRecord,
): SignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

export function createNonPromotableHarnessRecord(input: {
  readonly recordId: string;
  readonly harnessVersionId: string;
  readonly recordedAt: string;
  readonly signer: PrincipalSigner;
}): NonPromotableHarnessRecord {
  assertCondition(
    input.signer.identity.role === "operations_owner",
    "AUTHORIZATION_DENIED",
    "Only operations may quarantine a development candidate",
  );
  const core: RecordCore = {
    schemaVersion: 1,
    recordId: input.recordId,
    recordType: "non_promotable_harness",
    harnessVersionId: input.harnessVersionId,
    reason: "development_attribution_mutation_dry_run",
    developmentOnly: true,
    promotable: false,
    authorizedForResearchEvidence: false,
    forbiddenDestinations: NON_PROMOTABLE_DESTINATIONS,
    recordedAt: input.recordedAt,
    recordedBy: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: SignedBody = {
    ...core,
    recordHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  return {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
}

export function verifyNonPromotableHarnessRecord(input: {
  readonly record: NonPromotableHarnessRecord;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    NON_PROMOTABLE_HARNESS_RECORD_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.recordedBy.role === "operations_owner" &&
      canonicalize(input.record.publicPrincipal.identity) ===
        canonicalize(input.record.recordedBy),
    "AUTHORIZATION_DENIED",
    "Non-promotable record is not signed by operations",
  );
  assertCondition(
    canonicalize(input.record.forbiddenDestinations) ===
      canonicalize(NON_PROMOTABLE_DESTINATIONS) &&
      input.record.recordHash ===
        sha256(coreOf(input.record) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Non-promotable record hash or destinations changed",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.recordedBy,
    signedBodyOf(input.record) as unknown as JsonValue,
    input.record.attestation,
  );
}

export class NonPromotableHarnessRegistry {
  readonly #schemas: SchemaRegistry;
  readonly #log: AppendOnlyLog<JsonValue>;

  public constructor(input: {
    readonly root: string;
    readonly schemas: SchemaRegistry;
  }) {
    this.#schemas = input.schemas;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "governance"),
      "non-promotable.harnesses",
    );
  }

  public async register(
    record: NonPromotableHarnessRecord,
  ): Promise<void> {
    verifyNonPromotableHarnessRecord({
      record,
      schemas: this.#schemas,
    });
    const prior = (await this.all()).find(
      (entry) =>
        entry.harnessVersionId === record.harnessVersionId,
    );
    if (prior !== undefined) {
      assertCondition(
        prior.recordHash === record.recordHash,
        "CONFLICT",
        "Harness has conflicting non-promotable records",
      );
      return;
    }
    await this.#log.append(record as unknown as JsonValue);
  }

  public async all(): Promise<
    NonPromotableHarnessRecord[]
  > {
    const records = (await this.#log.readAll()).map(
      (entry) =>
        entry.payload as unknown as
          NonPromotableHarnessRecord,
    );
    for (const record of records) {
      verifyNonPromotableHarnessRecord({
        record,
        schemas: this.#schemas,
      });
    }
    return records;
  }

  public async recordFor(
    harnessVersionId: string,
  ): Promise<NonPromotableHarnessRecord | null> {
    return (
      (await this.all()).find(
        (record) =>
          record.harnessVersionId === harnessVersionId,
      ) ?? null
    );
  }

  public async assertQualificationAllowed(
    harnessVersionId: string,
  ): Promise<void> {
    assertCondition(
      (await this.recordFor(harnessVersionId)) === null,
      "AUTHORIZATION_DENIED",
      "Development-only harness cannot enter qualification, promotion, or deployment",
    );
  }
}
