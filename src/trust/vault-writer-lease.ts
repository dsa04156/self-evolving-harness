import {
  canonicalize,
  sha256,
  sha256Text,
  type JsonValue,
} from "../core/canonical.js";
import {
  SystemClock,
  type Clock,
} from "../core/determinism.js";
import {
  HarnessError,
  assertCondition,
} from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import {
  CasAppendOnlyLog,
  type CasAppendOnlyRecord,
} from "../storage/cas-append-only-log.js";
import {
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalSigner,
  type PublicPrincipal,
} from "./identity.js";
import {
  EVALUATOR_VAULT_WRITER_LEASE_POLICY,
  verifyEvaluatorVaultContract,
  type EvaluatorVaultContract,
} from "./evaluator-vault-contract.js";

export const VAULT_WRITER_LEASE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}vault-writer-lease.schema.json`;

export type VaultWriterLeaseAction =
  | "acquire"
  | "renew"
  | "release";

export interface VaultWriterLeaseRecord {
  readonly schemaVersion: 1;
  readonly recordType: "vault_writer_lease";
  readonly leaseId: string;
  readonly protocolId: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly action: VaultWriterLeaseAction;
  readonly ownerCommitment: string;
  readonly epoch: number;
  readonly priorLeaseRecordHash: string | null;
  readonly priorLeaseJournalHead: string | null;
  readonly acquiredAt: string;
  readonly validUntil: string;
  readonly releasedAt: string | null;
  readonly recordedAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export interface VaultWriterLeaseHandle {
  readonly ownerCommitment: string;
  readonly epoch: number;
  readonly leaseRecordHash: string;
  readonly leaseJournalHead: string;
  readonly acquiredAt: string;
  readonly validUntil: string;
}

type LeaseCore = Omit<
  VaultWriterLeaseRecord,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type LeaseSignedBody = Omit<
  VaultWriterLeaseRecord,
  "attestation"
>;

function leaseCore(
  record: VaultWriterLeaseRecord,
): LeaseCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function leaseSignedBody(
  record: VaultWriterLeaseRecord,
): LeaseSignedBody {
  const { attestation: _attestation, ...body } =
    record;
  return body;
}

function samePublicPrincipal(
  left: PublicPrincipal,
  right: PublicPrincipal,
): boolean {
  return (
    canonicalize(left as unknown as JsonValue) ===
    canonicalize(right as unknown as JsonValue)
  );
}

function timestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  assertCondition(
    Number.isFinite(parsed),
    "SCHEMA_INVALID",
    `${label} is not a valid timestamp`,
  );
  return parsed;
}

function activeAt(
  record: VaultWriterLeaseRecord,
  nowMillis: number,
): boolean {
  return (
    record.action !== "release" &&
    nowMillis < timestamp(record.validUntil, "Lease expiry")
  );
}

export function verifyVaultWriterLeaseRecord(input: {
  readonly record: VaultWriterLeaseRecord;
  readonly previous: VaultWriterLeaseRecord | null;
  readonly previousJournalHead: string | null;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    VAULT_WRITER_LEASE_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.protocolId ===
      input.contract.protocolId &&
      input.record.contractId ===
        input.contract.contractId &&
      input.record.contractHash ===
        input.contract.contractHash &&
      input.record.priorLeaseRecordHash ===
        (input.previous?.recordHash ?? null) &&
      input.record.priorLeaseJournalHead ===
        input.previousJournalHead &&
      canonicalize(
        input.record.recordedBy as unknown as JsonValue,
      ) ===
        canonicalize(
          input.contract.principalMatrix.vault
            .identity as unknown as JsonValue,
        ) &&
      samePublicPrincipal(
        input.record.publicPrincipal,
        input.contract.principalMatrix.vault,
      ) &&
      input.record.recordHash ===
        sha256(
          leaseCore(input.record) as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Vault writer lease binding, principal, or hash changed",
  );
  const recordedAt = timestamp(
    input.record.recordedAt,
    "Lease record time",
  );
  const acquiredAt = timestamp(
    input.record.acquiredAt,
    "Lease acquisition time",
  );
  const validUntil = timestamp(
    input.record.validUntil,
    "Lease expiry",
  );
  assertCondition(
    acquiredAt <= recordedAt && recordedAt < validUntil,
    "INVALID_STATE_TRANSITION",
    "Lease record is outside its validity interval",
  );
  if (input.record.action === "release") {
    assertCondition(
      input.record.releasedAt ===
        input.record.recordedAt,
      "INVALID_STATE_TRANSITION",
      "Lease release must bind its record time",
    );
  } else {
    assertCondition(
      input.record.releasedAt === null,
      "INVALID_STATE_TRANSITION",
      "Active lease record cannot carry a release time",
    );
  }

  if (input.previous === null) {
    assertCondition(
      input.record.action === "acquire" &&
        input.record.epoch === 1 &&
        input.record.priorLeaseRecordHash === null &&
        input.record.priorLeaseJournalHead === null,
      "INVALID_STATE_TRANSITION",
      "Lease journal must begin with epoch-one acquisition",
    );
  } else {
    const previousRecordedAt = timestamp(
      input.previous.recordedAt,
      "Previous lease record time",
    );
    assertCondition(
      recordedAt >= previousRecordedAt,
      "INVALID_STATE_TRANSITION",
      "Lease journal time moved backwards",
    );
    if (input.record.action === "acquire") {
      assertCondition(
        input.record.epoch ===
          input.previous.epoch + 1 &&
          (input.previous.action === "release" ||
            recordedAt >=
              timestamp(
                input.previous.validUntil,
                "Previous lease expiry",
              )),
        "CONFLICT",
        "A new lease epoch cannot replace an active writer",
      );
    } else {
      assertCondition(
        input.previous.action !== "release" &&
          input.record.ownerCommitment ===
            input.previous.ownerCommitment &&
          input.record.epoch === input.previous.epoch &&
          input.record.acquiredAt ===
            input.previous.acquiredAt &&
          recordedAt <
            timestamp(
              input.previous.validUntil,
              "Previous lease expiry",
            ),
        "CONFLICT",
        "Only the current unexpired writer may renew or release",
      );
      if (input.record.action === "renew") {
        assertCondition(
          validUntil >
            timestamp(
              input.previous.validUntil,
              "Previous lease expiry",
            ),
          "INVALID_STATE_TRANSITION",
          "Lease renewal must extend validity",
        );
      } else {
        assertCondition(
          input.record.validUntil ===
            input.previous.validUntil,
          "INVALID_STATE_TRANSITION",
          "Lease release cannot alter its validity bound",
        );
      }
    }
  }
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.recordedBy,
    leaseSignedBody(
      input.record,
    ) as unknown as JsonValue,
    input.record.attestation,
  );
}

export class VaultWriterLease {
  readonly #contract: EvaluatorVaultContract;
  readonly #schemas: SchemaRegistry;
  readonly #signer: PrincipalSigner;
  readonly #clock: Clock;
  readonly #ttlMillis: number;
  readonly #ownerCommitment: string;
  readonly #log: CasAppendOnlyLog<JsonValue>;

  public constructor(input: {
    readonly root: string;
    readonly ownerId: string;
    readonly contract: EvaluatorVaultContract;
    readonly schemas: SchemaRegistry;
    readonly vaultSigner: PrincipalSigner;
    readonly clock?: Clock;
    readonly ttlMillis?: number;
  }) {
    verifyEvaluatorVaultContract({
      record: input.contract,
      schemas: input.schemas,
    });
    assertCondition(
      samePublicPrincipal(
        input.vaultSigner.exportPublic(),
        input.contract.principalMatrix.vault,
      ),
      "AUTHENTICATION_FAILED",
      "Vault writer lease requires the frozen vault signer",
    );
    assertCondition(
      /^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,159}$/u.test(
        input.ownerId,
      ),
      "SCHEMA_INVALID",
      "Vault lease owner ID is invalid",
    );
    const ttlMillis =
      input.ttlMillis ??
      EVALUATOR_VAULT_WRITER_LEASE_POLICY.defaultTtlMillis;
    assertCondition(
      Number.isSafeInteger(ttlMillis) &&
        ttlMillis >=
          EVALUATOR_VAULT_WRITER_LEASE_POLICY.minimumTtlMillis &&
        ttlMillis <=
          EVALUATOR_VAULT_WRITER_LEASE_POLICY.maximumTtlMillis,
      "SCHEMA_INVALID",
      "Vault lease TTL must be between 100 ms and 5 minutes",
    );
    this.#contract = input.contract;
    this.#schemas = input.schemas;
    this.#signer = input.vaultSigner;
    this.#clock = input.clock ?? new SystemClock();
    this.#ttlMillis = ttlMillis;
    this.#ownerCommitment = sha256Text(input.ownerId);
    this.#log = new CasAppendOnlyLog<JsonValue>(
      input.root,
      `vault-writer-lease.${input.contract.contractId}`,
    );
  }

  public get ownerCommitment(): string {
    return this.#ownerCommitment;
  }

  public async recover(): Promise<
    readonly {
      readonly journal: CasAppendOnlyRecord<JsonValue>;
      readonly lease: VaultWriterLeaseRecord;
    }[]
  > {
    await this.#log.synchronize();
    const records = await this.#log.readAll();
    const verified: {
      readonly journal: CasAppendOnlyRecord<JsonValue>;
      readonly lease: VaultWriterLeaseRecord;
    }[] = [];
    for (const record of records) {
      const lease =
        record.payload as unknown as VaultWriterLeaseRecord;
      const previous = verified.at(-1);
      verifyVaultWriterLeaseRecord({
        record: lease,
        previous: previous?.lease ?? null,
        previousJournalHead:
          previous?.journal.recordHash ?? null,
        contract: this.#contract,
        schemas: this.#schemas,
      });
      assertCondition(
        lease.priorLeaseJournalHead ===
          record.previousRecordHash,
        "HASH_MISMATCH",
        "Lease record is detached from its CAS journal",
      );
      verified.push({ journal: record, lease });
    }
    return verified;
  }

  public async acquire(): Promise<VaultWriterLeaseHandle> {
    const records = await this.recover();
    const previous = records.at(-1);
    const now = this.#clock.now();
    if (
      previous !== undefined &&
      activeAt(previous.lease, now.getTime())
    ) {
      throw new HarnessError(
        "CONFLICT",
        "Vault writer lease is held by an active epoch",
        { retryable: true },
      );
    }
    const epoch =
      previous === undefined
        ? 1
        : previous.lease.epoch + 1;
    const acquiredAt = now.toISOString();
    return this.#append({
      action: "acquire",
      epoch,
      acquiredAt,
      validUntil: new Date(
        now.getTime() + this.#ttlMillis,
      ).toISOString(),
      releasedAt: null,
      recordedAt: acquiredAt,
      previous: previous ?? null,
    });
  }

  public async renew(
    handle: VaultWriterLeaseHandle,
  ): Promise<VaultWriterLeaseHandle> {
    const previous = await this.#assertCurrent(handle);
    const now = this.#clock.now();
    const previousExpiry = timestamp(
      previous.lease.validUntil,
      "Previous lease expiry",
    );
    const nextExpiry = Math.max(
      previousExpiry + 1,
      now.getTime() + this.#ttlMillis,
    );
    return this.#append({
      action: "renew",
      epoch: handle.epoch,
      acquiredAt: handle.acquiredAt,
      validUntil: new Date(nextExpiry).toISOString(),
      releasedAt: null,
      recordedAt: now.toISOString(),
      previous,
    });
  }

  public async release(
    handle: VaultWriterLeaseHandle,
  ): Promise<void> {
    const previous = await this.#assertCurrent(handle);
    const now = this.#clock.now().toISOString();
    await this.#append({
      action: "release",
      epoch: handle.epoch,
      acquiredAt: handle.acquiredAt,
      validUntil: handle.validUntil,
      releasedAt: now,
      recordedAt: now,
      previous,
    });
  }

  public async assertCurrent(
    handle: VaultWriterLeaseHandle,
  ): Promise<void> {
    await this.#assertCurrent(handle);
  }

  async #assertCurrent(
    handle: VaultWriterLeaseHandle,
  ): Promise<{
    readonly journal: CasAppendOnlyRecord<JsonValue>;
    readonly lease: VaultWriterLeaseRecord;
  }> {
    const current = (await this.recover()).at(-1);
    assertCondition(
      current !== undefined &&
        current.lease.action !== "release" &&
        current.lease.ownerCommitment ===
          handle.ownerCommitment &&
        current.lease.epoch === handle.epoch &&
        current.lease.recordHash ===
          handle.leaseRecordHash &&
        current.journal.recordHash ===
          handle.leaseJournalHead &&
        this.#clock.now().getTime() <
          timestamp(
            current.lease.validUntil,
            "Lease expiry",
          ),
      "CONFLICT",
      "Vault writer is stale, superseded, released, or expired",
    );
    return current;
  }

  async #append(input: {
    readonly action: VaultWriterLeaseAction;
    readonly epoch: number;
    readonly acquiredAt: string;
    readonly validUntil: string;
    readonly releasedAt: string | null;
    readonly recordedAt: string;
    readonly previous: {
      readonly journal: CasAppendOnlyRecord<JsonValue>;
      readonly lease: VaultWriterLeaseRecord;
    } | null;
  }): Promise<VaultWriterLeaseHandle> {
    const core: LeaseCore = {
      schemaVersion: 1,
      recordType: "vault_writer_lease",
      leaseId: `vault-writer.${this.#contract.contractId}`,
      protocolId: this.#contract.protocolId,
      contractId: this.#contract.contractId,
      contractHash: this.#contract.contractHash,
      action: input.action,
      ownerCommitment: this.#ownerCommitment,
      epoch: input.epoch,
      priorLeaseRecordHash:
        input.previous?.lease.recordHash ?? null,
      priorLeaseJournalHead:
        input.previous?.journal.recordHash ?? null,
      acquiredAt: input.acquiredAt,
      validUntil: input.validUntil,
      releasedAt: input.releasedAt,
      recordedAt: input.recordedAt,
      recordedBy: this.#signer.identity,
    };
    const publicPrincipal = this.#signer.exportPublic();
    const body: LeaseSignedBody = {
      ...core,
      recordHash: sha256(core as unknown as JsonValue),
      publicPrincipal,
    };
    const lease: VaultWriterLeaseRecord = {
      ...body,
      attestation: this.#signer.attest(
        body as unknown as JsonValue,
      ),
    };
    verifyVaultWriterLeaseRecord({
      record: lease,
      previous: input.previous?.lease ?? null,
      previousJournalHead:
        input.previous?.journal.recordHash ?? null,
      contract: this.#contract,
      schemas: this.#schemas,
    });
    const appended = await this.#log.appendExpected({
      expectedHeadHash:
        input.previous?.journal.recordHash ?? null,
      payload: lease as unknown as JsonValue,
    });
    const reread = await this.#log.head();
    assertCondition(
      reread?.recordHash === appended.recordHash,
      "HASH_MISMATCH",
      "Vault lease commit was not the durable journal head",
    );
    return {
      ownerCommitment: lease.ownerCommitment,
      epoch: lease.epoch,
      leaseRecordHash: lease.recordHash,
      leaseJournalHead: appended.recordHash,
      acquiredAt: lease.acquiredAt,
      validUntil: lease.validUntil,
    };
  }
}
