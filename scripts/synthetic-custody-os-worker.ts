import {
  constants,
} from "node:fs";
import {
  access,
  chmod,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

import {
  HarnessError,
  PrincipalSigner,
  SchemaRegistry,
  SYNTHETIC_CUSTODY_CAPABILITY_SCHEMA_ID,
  SYNTHETIC_CUSTODY_RELEASE_REQUEST_SCHEMA_ID,
  SyntheticCustodyJournal,
  canonicalBytes,
  asHarnessError,
  createEncryptedSyntheticCustody,
  createSyntheticCustodyCapability,
  createSyntheticCustodyEvaluatorReceipt,
  createSyntheticCustodyReleaseRequest,
  decryptSyntheticCustody,
  fixedInertSyntheticPayload,
  parseStrictJson,
  sha256,
  sha256Bytes,
  type Attestation,
  type EvaluatorVaultContract,
  type JsonValue,
  type PrincipalIdentity,
  type PublicPrincipal,
  type SyntheticCustodyCapability,
  type SyntheticCustodyCleanupReason,
  type SyntheticCustodyDescriptor,
  type SyntheticCustodyEnvelope,
  type SyntheticCustodyEvaluatorReceipt,
  type SyntheticCustodyJournalDisposition,
  type SyntheticCustodyReleaseRequest,
} from "../src/index.js";

const INPUT =
  process.env["SEH_WORKER_INPUT"] ?? "/input";
const OUTPUT =
  process.env["SEH_WORKER_OUTPUT"] ?? "/state";
const SCHEMAS =
  process.env["SEH_WORKER_SCHEMAS"] ??
  "/opt/seh/schemas";
const PRIVATE_KEY =
  process.env["SEH_WORKER_PRIVATE_KEY"] ??
  "/run/keys/private.pem";
const CUSTODY =
  process.env["SEH_CUSTODY_ROOT"] ?? "/custody";
const CUSTODY_STATE =
  process.env["SEH_CUSTODY_STATE_ROOT"] ??
  "/custody-state";
const MATERIALIZATION =
  process.env[
    "SEH_CUSTODY_MATERIALIZATION_ROOT"
  ] ?? "/materialization";
const RETAINED =
  process.env["SEH_CUSTODY_RETAINED_ROOT"] ??
  "/retained";
const LOGS =
  process.env["SEH_CUSTODY_LOG_ROOT"] ?? "/logs";
const REPOSITORY_SCAN =
  process.env[
    "SEH_CUSTODY_REPOSITORY_SCAN_ROOT"
  ] ?? "/scan/repository";

const ROLE_RECEIPT_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/synthetic-custody-role-receipt.schema.json";
const OPERATION_RESULT_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/synthetic-custody-operation-result.schema.json";
const PROJECTION_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/synthetic-custody-commitment-projection.schema.json";
const LEAKAGE_SCAN_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/synthetic-custody-leakage-scan.schema.json";
const FINAL_AUDIT_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/synthetic-custody-final-audit.schema.json";

const ROLE_NAMES = [
  "protocol_author",
  "benchmark_author",
  "benchmark_reviewer",
  "vault",
  "evaluator",
  "scorer",
  "promoter",
  "audit_store",
] as const;

type BoundaryRole = (typeof ROLE_NAMES)[number];

type WorkerMode =
  | "seal_custody"
  | "sign_release"
  | "reserve_release"
  | "materialize"
  | "consume"
  | "cleanup"
  | "recover_cleanup"
  | "tamper_private_envelope"
  | "forge_substituted_capability"
  | "sign_substituted_release"
  | "scorer_projection"
  | "promoter_projection"
  | "finalize_audit";

interface WorkerConfiguration {
  readonly mode: WorkerMode;
  readonly role: BoundaryRole;
  readonly timestamp: string;
  readonly custodyId: string;
  readonly capabilityId?: string;
  readonly capabilityIssuedAt?: string;
  readonly capabilityExpiresAt?: string;
  readonly capabilityNonce?: string;
  readonly requestId?: string;
  readonly senderSequence?: number;
  readonly requestNonce?: string;
  readonly cleanupReason?:
    SyntheticCustodyCleanupReason;
  readonly consumerBehavior?:
    | "normal"
    | "crash_after_read"
    | "timeout";
  readonly crashAfterPlaintextWrite?: boolean;
  readonly crashAfterReservationCommit?: boolean;
  readonly crashAfterMaterializationStart?: boolean;
  readonly crashAfterPlaintextDelete?: boolean;
  readonly crashAfterPrivateDelete?: boolean;
  readonly crashAfterCleanupCommit?: boolean;
  readonly tamperKind?:
    | "ciphertext"
    | "authentication_tag"
    | "nonce"
    | "aad_custody_id"
    | "aad_protocol_id"
    | "aad_contract_id"
    | "aad_contract_hash"
    | "aad_task_handle"
    | "aad_author_commitment"
    | "aad_included_transition"
    | "aad_admitted_state"
    | "aad_unlock_capability"
    | "aad_plaintext_commitment"
    | "aad_payload_length"
    | "aad_delivery_guarantee"
    | "envelope_swap";
  readonly substitutionField?:
    | "custodyId"
    | "admittedVaultStateHead"
    | "authorCommitmentHash"
    | "taskHandleCommitment"
    | "unlockCapabilityHash";
}

interface SyntheticCustodyRoleReceipt {
  readonly schemaVersion: 1;
  readonly recordType:
    "synthetic_custody_role_receipt";
  readonly receiptId: string;
  readonly protocolId: string;
  readonly contractHash: string;
  readonly custodyId: string;
  readonly role: BoundaryRole;
  readonly action: WorkerMode;
  readonly process: ReturnType<
    typeof processIdentity
  >;
  readonly inputCommitments: readonly string[];
  readonly outputCommitments: readonly string[];
  readonly inertPayloadObserved: boolean;
  readonly taskBodyPresent: false;
  readonly verifierLogicPresent: false;
  readonly labelPresent: false;
  readonly taskPathPresent: false;
  readonly modelPromptPresent: false;
  readonly keyReleased: false;
  readonly ciphertextReleased: false;
  readonly reusableDecryptionAuthorityReleased: false;
  readonly privateMaterialEmbeddedInReceipt: false;
  readonly occurredAt: string;
  readonly producer: PrincipalIdentity;
  readonly receiptHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

interface SignedHashRecord {
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

function requireString(
  value: string | undefined,
  label: string,
): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function requireNumber(
  value: number | undefined,
  label: string,
): number {
  if (
    value === undefined ||
    !Number.isSafeInteger(value)
  ) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function processIdentity() {
  return {
    uid: process.getuid?.() ?? -1,
    gid: process.getgid?.() ?? -1,
    isolationClass:
      "os_enforced_subordinate_uid" as const,
  };
}

async function readJson<T>(
  file: string,
): Promise<T> {
  return parseStrictJson(
    await readFile(file, "utf8"),
  ) as unknown as T;
}

async function readInput<T>(
  name: string,
): Promise<T> {
  return readJson<T>(path.join(INPUT, name));
}

async function syncDirectory(
  directory: string,
): Promise<void> {
  const handle = await open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY,
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeBytes(
  file: string,
  bytes: Uint8Array,
  mode = 0o600,
): Promise<void> {
  await mkdir(path.dirname(file), {
    recursive: true,
    mode: 0o700,
  });
  const handle = await open(
    file,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    mode,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(path.dirname(file));
}

async function writeJson(
  name: string,
  value: JsonValue,
): Promise<void> {
  await writeBytes(
    path.join(OUTPUT, name),
    canonicalBytes(value),
  );
}

async function replaceJsonFile(
  file: string,
  value: JsonValue,
): Promise<void> {
  const temporary = `${file}.replace-${process.pid}`;
  await rm(temporary, { force: true });
  await writeBytes(temporary, canonicalBytes(value));
  await rename(temporary, file);
  await syncDirectory(path.dirname(file));
}

async function loadConfiguration(): Promise<WorkerConfiguration> {
  return readInput<WorkerConfiguration>(
    "config.json",
  );
}

async function loadSigner(): Promise<PrincipalSigner> {
  const principal =
    await readInput<PublicPrincipal>(
      "own-public.json",
    );
  return PrincipalSigner.import({
    identity: principal.identity,
    keyId: principal.keyId,
    privateKeyPem: await readFile(
      PRIVATE_KEY,
      "utf8",
    ),
    publicKeyPem: principal.publicKeyPem,
  });
}

async function loadContract(): Promise<EvaluatorVaultContract> {
  return readInput<EvaluatorVaultContract>(
    "contract.json",
  );
}

function objectRoot(custodyId: string): string {
  return path.join(CUSTODY, custodyId);
}

function journalRoot(custodyId: string): string {
  return path.join(CUSTODY_STATE, custodyId);
}

function plaintextPath(): string {
  return path.join(
    MATERIALIZATION,
    "payload.bin",
  );
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code ===
      "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

async function createRoleReceipt(input: {
  readonly config: WorkerConfiguration;
  readonly schemas: SchemaRegistry;
  readonly signer: PrincipalSigner;
  readonly contract: EvaluatorVaultContract;
  readonly inputCommitments: readonly string[];
  readonly outputCommitments: readonly string[];
  readonly inertPayloadObserved?: boolean;
}): Promise<SyntheticCustodyRoleReceipt> {
  const core = {
    schemaVersion: 1 as const,
    recordType:
      "synthetic_custody_role_receipt" as const,
    receiptId:
      `custody-receipt:${input.config.role}:${input.config.mode}:${sha256(
        [
          ...input.outputCommitments,
        ].sort() as unknown as JsonValue,
      ).slice(7, 23)}`,
    protocolId: input.contract.protocolId,
    contractHash: input.contract.contractHash,
    custodyId: input.config.custodyId,
    role: input.config.role,
    action: input.config.mode,
    process: processIdentity(),
    inputCommitments: [
      ...new Set(input.inputCommitments),
    ].sort(),
    outputCommitments: [
      ...new Set(input.outputCommitments),
    ].sort(),
    inertPayloadObserved:
      input.inertPayloadObserved ?? false,
    taskBodyPresent: false as const,
    verifierLogicPresent: false as const,
    labelPresent: false as const,
    taskPathPresent: false as const,
    modelPromptPresent: false as const,
    keyReleased: false as const,
    ciphertextReleased: false as const,
    reusableDecryptionAuthorityReleased:
      false as const,
    privateMaterialEmbeddedInReceipt:
      false as const,
    occurredAt: input.config.timestamp,
    producer: input.signer.identity,
  };
  const publicPrincipal =
    input.signer.exportPublic();
  const signedBody = {
    ...core,
    receiptHash: sha256(
      core as unknown as JsonValue,
    ),
    publicPrincipal,
  };
  const receipt: SyntheticCustodyRoleReceipt = {
    ...signedBody,
    attestation: input.signer.attest(
      signedBody as unknown as JsonValue,
    ),
  };
  input.schemas.validate(
    ROLE_RECEIPT_SCHEMA_ID,
    receipt as unknown as JsonValue,
  );
  await writeJson(
    "receipt.json",
    receipt as unknown as JsonValue,
  );
  return receipt;
}

async function writeOperationResult(input: {
  readonly schemas: SchemaRegistry;
  readonly descriptor: SyntheticCustodyDescriptor;
  readonly disposition:
    SyntheticCustodyJournalDisposition;
  readonly materializationCreated: boolean;
  readonly currentState?:
    | "sealed"
    | "release_reserved"
    | "materialization_started"
    | "cleanup_started"
    | "cleaned";
}): Promise<void> {
  const result = {
    schemaVersion: 1,
    recordType:
      "synthetic_custody_operation_result",
    ok: input.disposition.failure === null,
    failure: input.disposition.failure,
    custodyId: input.descriptor.custodyId,
    descriptorHash:
      input.descriptor.recordHash,
    transition: input.disposition.transition,
    journalHead: input.disposition.journalHead,
    state:
      input.currentState ??
      input.disposition.transition.stateAfter,
    newlyCommitted:
      input.disposition.newlyCommitted,
    materializationCreated:
      input.materializationCreated,
    keyFilePresent: await exists(
      path.join(
        objectRoot(input.descriptor.custodyId),
        "key.bin",
      ),
    ),
    ciphertextFilePresent: await exists(
      path.join(
        objectRoot(input.descriptor.custodyId),
        "envelope.json",
      ),
    ),
    plaintextFilePresent:
      await exists(plaintextPath()),
    process: processIdentity(),
  };
  input.schemas.validate(
    OPERATION_RESULT_SCHEMA_ID,
    result as unknown as JsonValue,
  );
  await writeJson(
    "result.json",
    result as unknown as JsonValue,
  );
}

function loadJournal(input: {
  readonly descriptor: SyntheticCustodyDescriptor;
  readonly contract: EvaluatorVaultContract;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): SyntheticCustodyJournal {
  return new SyntheticCustodyJournal({
    root: journalRoot(
      input.descriptor.custodyId,
    ),
    descriptor: input.descriptor,
    contract: input.contract,
    signer: input.signer,
    schemas: input.schemas,
  });
}

async function sealCustody(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const [contract, binding] = await Promise.all([
    loadContract(),
    readInput<{
      readonly taskHandleCommitment: string;
      readonly authorCommitmentHash: string;
      readonly includedTransitionHash: string;
      readonly admittedVaultStateHead: string;
      readonly unlockCapabilityHash: string;
    }>("binding.json"),
  ]);
  const payload = fixedInertSyntheticPayload();
  const sealed = createEncryptedSyntheticCustody({
    custodyId: config.custodyId,
    ...binding,
    payload,
    createdAt: config.timestamp,
    signer,
    contract,
    schemas,
  });
  const root = objectRoot(config.custodyId);
  await mkdir(root, {
    recursive: false,
    mode: 0o700,
  });
  await writeBytes(
    path.join(root, "key.bin"),
    sealed.key,
  );
  await writeBytes(
    path.join(root, "envelope.json"),
    canonicalBytes(
      sealed.envelope as unknown as JsonValue,
    ),
  );
  const capability =
    createSyntheticCustodyCapability({
      capabilityId: requireString(
        config.capabilityId,
        "capabilityId",
      ),
      descriptor: sealed.descriptor,
      issuedAt: requireString(
        config.capabilityIssuedAt,
        "capabilityIssuedAt",
      ),
      expiresAt: requireString(
        config.capabilityExpiresAt,
        "capabilityExpiresAt",
      ),
      nonce: requireString(
        config.capabilityNonce,
        "capabilityNonce",
      ),
      signer,
      contract,
      schemas,
    });
  const journal = loadJournal({
    descriptor: sealed.descriptor,
    contract,
    signer,
    schemas,
  });
  const initialized = await journal.initialize(
    config.timestamp,
  );
  await writeJson(
    "descriptor.json",
    sealed.descriptor as unknown as JsonValue,
  );
  await writeJson(
    "capability.json",
    capability as unknown as JsonValue,
  );
  await writeOperationResult({
    schemas,
    descriptor: sealed.descriptor,
    disposition: initialized,
    materializationCreated: false,
  });
  await createRoleReceipt({
    config,
    schemas,
    signer,
    contract,
    inputCommitments: [
      contract.contractHash,
      binding.taskHandleCommitment,
      binding.authorCommitmentHash,
      binding.includedTransitionHash,
      binding.admittedVaultStateHead,
      binding.unlockCapabilityHash,
    ],
    outputCommitments: [
      sealed.descriptor.recordHash,
      capability.capabilityHash,
      initialized.transition.recordHash,
      initialized.journalHead,
    ],
  });
  payload.fill(0);
  sealed.key.fill(0);
}

async function signRelease(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const [contract, descriptor, capability] =
    await Promise.all([
      loadContract(),
      readInput<SyntheticCustodyDescriptor>(
        "descriptor.json",
      ),
      readInput<SyntheticCustodyCapability>(
        "capability.json",
      ),
    ]);
  const request =
    createSyntheticCustodyReleaseRequest({
      requestId: requireString(
        config.requestId,
        "requestId",
      ),
      descriptor,
      capability,
      senderSequence: requireNumber(
        config.senderSequence,
        "senderSequence",
      ),
      nonce: requireString(
        config.requestNonce,
        "requestNonce",
      ),
      requestedAt: config.timestamp,
      signer,
      contract,
      schemas,
    });
  await writeJson(
    "request.json",
    request as unknown as JsonValue,
  );
  await createRoleReceipt({
    config,
    schemas,
    signer,
    contract,
    inputCommitments: [
      descriptor.recordHash,
      capability.capabilityHash,
    ],
    outputCommitments: [request.requestHash],
  });
}

function changedText(value: string): string {
  const first = value[0] === "A" ? "B" : "A";
  return `${first}${value.slice(1)}`;
}

async function tamperPrivateEnvelope(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const [contract, descriptor] = await Promise.all([
    loadContract(),
    readInput<SyntheticCustodyDescriptor>(
      "descriptor.json",
    ),
  ]);
  const kind = requireString(
    config.tamperKind,
    "tamperKind",
  ) as NonNullable<WorkerConfiguration["tamperKind"]>;
  const file = path.join(
    objectRoot(descriptor.custodyId),
    "envelope.json",
  );
  const original =
    await readJson<SyntheticCustodyEnvelope>(file);
  let mutated: Record<string, unknown>;
  if (kind === "envelope_swap") {
    const swapped = createEncryptedSyntheticCustody({
      custodyId:
        `${descriptor.custodyId}.swap-source`,
      taskHandleCommitment:
        descriptor.taskHandleCommitment,
      authorCommitmentHash:
        descriptor.authorCommitmentHash,
      includedTransitionHash:
        descriptor.includedTransitionHash,
      admittedVaultStateHead:
        descriptor.admittedVaultStateHead,
      unlockCapabilityHash:
        descriptor.unlockCapabilityHash,
      payload: fixedInertSyntheticPayload(),
      createdAt: config.timestamp,
      signer,
      contract,
      schemas,
    });
    mutated =
      swapped.envelope as unknown as Record<
        string,
        unknown
      >;
    swapped.key.fill(0);
  } else {
    mutated = structuredClone(
      original,
    ) as unknown as Record<string, unknown>;
    const aad = mutated["aad"] as Record<
      string,
      unknown
    >;
    const replacementHash = sha256(
      ["synthetic-custody-tamper", kind] as unknown as JsonValue,
    );
    switch (kind) {
      case "ciphertext":
        mutated["ciphertext"] = changedText(
          String(mutated["ciphertext"]),
        );
        break;
      case "authentication_tag":
        mutated["authenticationTag"] = changedText(
          String(mutated["authenticationTag"]),
        );
        break;
      case "nonce":
        mutated["nonce"] = changedText(
          String(mutated["nonce"]),
        );
        break;
      case "aad_custody_id":
        aad["custodyId"] =
          "synthetic-custody.tampered";
        break;
      case "aad_protocol_id":
        aad["protocolId"] =
          `protocol-sha256:${"e".repeat(64)}`;
        break;
      case "aad_contract_id":
        aad["contractId"] =
          "synthetic-custody.tampered-contract";
        break;
      case "aad_contract_hash":
        aad["contractHash"] = replacementHash;
        break;
      case "aad_task_handle":
        aad["taskHandleCommitment"] =
          replacementHash;
        break;
      case "aad_author_commitment":
        aad["authorCommitmentHash"] =
          replacementHash;
        break;
      case "aad_included_transition":
        aad["includedTransitionHash"] =
          replacementHash;
        break;
      case "aad_admitted_state":
        aad["admittedVaultStateHead"] =
          replacementHash;
        break;
      case "aad_unlock_capability":
        aad["unlockCapabilityHash"] =
          replacementHash;
        break;
      case "aad_plaintext_commitment":
        aad["plaintextCommitment"] =
          replacementHash;
        break;
      case "aad_payload_length":
        aad["payloadLength"] = 63;
        break;
      case "aad_delivery_guarantee":
        aad["deliveryGuarantee"] =
          "tampered_delivery_guarantee";
        break;
    }
  }
  await replaceJsonFile(
    file,
    mutated as JsonValue,
  );
  await createRoleReceipt({
    config,
    schemas,
    signer,
    contract,
    inputCommitments: [
      descriptor.recordHash,
      original.envelopeHash,
    ],
    outputCommitments: [
      sha256(mutated as JsonValue),
    ],
  });
}

async function forgeSubstitutedCapability(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const [contract, descriptor, capability] =
    await Promise.all([
      loadContract(),
      readInput<SyntheticCustodyDescriptor>(
        "descriptor.json",
      ),
      readInput<SyntheticCustodyCapability>(
        "capability.json",
      ),
    ]);
  const field = requireString(
    config.substitutionField,
    "substitutionField",
  ) as NonNullable<
    WorkerConfiguration["substitutionField"]
  >;
  const {
    capabilityHash: _capabilityHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...originalCore
  } = capability;
  const core = {
    ...originalCore,
    [field]:
      field === "custodyId"
        ? "synthetic-custody.substituted"
        : sha256(
            [
              "synthetic-custody-substitution",
              field,
            ] as unknown as JsonValue,
          ),
  };
  const publicPrincipal = signer.exportPublic();
  const body = {
    ...core,
    capabilityHash: sha256(
      core as unknown as JsonValue,
    ),
    publicPrincipal,
  };
  const substituted = {
    ...body,
    attestation: signer.attest(
      body as unknown as JsonValue,
    ),
  } as SyntheticCustodyCapability;
  schemas.validate(
    SYNTHETIC_CUSTODY_CAPABILITY_SCHEMA_ID,
    substituted as unknown as JsonValue,
  );
  await writeJson(
    "capability.json",
    substituted as unknown as JsonValue,
  );
  await createRoleReceipt({
    config,
    schemas,
    signer,
    contract,
    inputCommitments: [
      descriptor.recordHash,
      capability.capabilityHash,
    ],
    outputCommitments: [
      substituted.capabilityHash,
    ],
  });
}

async function signSubstitutedRelease(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const [contract, descriptor, capability] =
    await Promise.all([
      loadContract(),
      readInput<SyntheticCustodyDescriptor>(
        "descriptor.json",
      ),
      readInput<SyntheticCustodyCapability>(
        "capability.json",
      ),
    ]);
  const core = {
    schemaVersion: 1 as const,
    recordType:
      "synthetic_custody_release_request" as const,
    requestId: requireString(
      config.requestId,
      "requestId",
    ),
    protocolId: descriptor.protocolId,
    contractId: descriptor.contractId,
    contractHash: descriptor.contractHash,
    custodyId: descriptor.custodyId,
    descriptorHash: descriptor.recordHash,
    capability,
    senderSequence: requireNumber(
      config.senderSequence,
      "senderSequence",
    ),
    nonce: requireString(
      config.requestNonce,
      "requestNonce",
    ),
    requestedAt: config.timestamp,
    actor: signer.identity,
  };
  const publicPrincipal = signer.exportPublic();
  const body = {
    ...core,
    requestHash: sha256(
      core as unknown as JsonValue,
    ),
    publicPrincipal,
  };
  const request = {
    ...body,
    attestation: signer.attest(
      body as unknown as JsonValue,
    ),
  } as SyntheticCustodyReleaseRequest;
  schemas.validate(
    SYNTHETIC_CUSTODY_RELEASE_REQUEST_SCHEMA_ID,
    request as unknown as JsonValue,
  );
  await writeJson(
    "request.json",
    request as unknown as JsonValue,
  );
  await createRoleReceipt({
    config,
    schemas,
    signer,
    contract,
    inputCommitments: [
      descriptor.recordHash,
      capability.capabilityHash,
    ],
    outputCommitments: [request.requestHash],
  });
}

async function reserveRelease(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const [contract, descriptor, request] =
    await Promise.all([
      loadContract(),
      readInput<SyntheticCustodyDescriptor>(
        "descriptor.json",
      ),
      readInput<SyntheticCustodyReleaseRequest>(
        "request.json",
      ),
    ]);
  const journal = loadJournal({
    descriptor,
    contract,
    signer,
    schemas,
  });
  const disposition = await journal.reserve(
    request,
  );
  if (
    config.crashAfterReservationCommit === true &&
    disposition.failure === null &&
    disposition.newlyCommitted
  ) {
    process.kill(process.pid, "SIGKILL");
  }
  await writeOperationResult({
    schemas,
    descriptor,
    disposition,
    materializationCreated: false,
  });
  await createRoleReceipt({
    config,
    schemas,
    signer,
    contract,
    inputCommitments: [
      descriptor.recordHash,
      request.requestHash,
      request.capability.capabilityHash,
    ],
    outputCommitments: [
      disposition.transition.recordHash,
      disposition.journalHead,
    ],
  });
}

async function materialize(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const [contract, descriptor, request] =
    await Promise.all([
      loadContract(),
      readInput<SyntheticCustodyDescriptor>(
        "descriptor.json",
      ),
      readInput<SyntheticCustodyReleaseRequest>(
        "request.json",
      ),
    ]);
  const journal = loadJournal({
    descriptor,
    contract,
    signer,
    schemas,
  });
  const disposition =
    await journal.beginMaterialization({
      request,
      occurredAt: config.timestamp,
    });
  if (
    config.crashAfterMaterializationStart === true &&
    disposition.failure === null &&
    disposition.newlyCommitted
  ) {
    process.kill(process.pid, "SIGKILL");
  }
  if (
    disposition.failure !== null ||
    !disposition.newlyCommitted
  ) {
    await writeOperationResult({
      schemas,
      descriptor,
      disposition,
      materializationCreated: false,
      currentState:
        (await journal.state()) ??
        disposition.transition.stateAfter,
    });
    await createRoleReceipt({
      config,
      schemas,
      signer,
      contract,
      inputCommitments: [
        descriptor.recordHash,
        request.requestHash,
      ],
      outputCommitments: [
        disposition.transition.recordHash,
        disposition.journalHead,
      ],
    });
    return;
  }
  const root = objectRoot(descriptor.custodyId);
  const [key, envelope] = await Promise.all([
    readFile(path.join(root, "key.bin")),
    readJson<SyntheticCustodyEnvelope>(
      path.join(root, "envelope.json"),
    ),
  ]);
  let payload: Buffer;
  try {
    payload = decryptSyntheticCustody({
      key,
      envelope,
      descriptor,
      contract,
      schemas,
    });
  } catch (error) {
    const code = asHarnessError(error).code;
    const materializationFailureCode = (
      [
        "AUTHENTICATION_FAILED",
        "AUTHORIZATION_DENIED",
        "SCHEMA_INVALID",
        "HASH_MISMATCH",
        "PROTOCOL_MISMATCH",
      ] as const
    ).includes(
      code as
        | "AUTHENTICATION_FAILED"
        | "AUTHORIZATION_DENIED"
        | "SCHEMA_INVALID"
        | "HASH_MISMATCH"
        | "PROTOCOL_MISMATCH",
    )
      ? (code as
          | "AUTHENTICATION_FAILED"
          | "AUTHORIZATION_DENIED"
          | "SCHEMA_INVALID"
          | "HASH_MISMATCH"
          | "PROTOCOL_MISMATCH")
      : "AUTHENTICATION_FAILED";
    const denied =
      await journal.recordMaterializationDenial({
        request,
        failureCode: materializationFailureCode,
        occurredAt: config.timestamp,
      });
    await writeOperationResult({
      schemas,
      descriptor,
      disposition: denied,
      materializationCreated: false,
      currentState:
        (await journal.state()) ??
        denied.transition.stateAfter,
    });
    await createRoleReceipt({
      config,
      schemas,
      signer,
      contract,
      inputCommitments: [
        descriptor.recordHash,
        request.requestHash,
      ],
      outputCommitments: [
        denied.transition.recordHash,
        denied.journalHead,
      ],
    });
    key.fill(0);
    return;
  }
  await mkdir(MATERIALIZATION, {
    recursive: true,
    mode: 0o700,
  });
  await writeBytes(
    plaintextPath(),
    payload,
    0o400,
  );
  await chmod(plaintextPath(), 0o444);
  if (config.crashAfterPlaintextWrite === true) {
    process.kill(process.pid, "SIGKILL");
  }
  await writeOperationResult({
    schemas,
    descriptor,
    disposition,
    materializationCreated: true,
    currentState:
      (await journal.state()) ??
      disposition.transition.stateAfter,
  });
  await createRoleReceipt({
    config,
    schemas,
    signer,
    contract,
    inputCommitments: [
      descriptor.recordHash,
      request.requestHash,
      request.capability.capabilityHash,
    ],
    outputCommitments: [
      disposition.transition.recordHash,
      disposition.journalHead,
      descriptor.plaintextCommitment,
    ],
  });
  payload.fill(0);
  key.fill(0);
}

async function assertReadOnly(
  file: string,
): Promise<void> {
  try {
    const handle = await open(
      file,
      constants.O_RDWR | constants.O_NOFOLLOW,
    );
    await handle.close();
    throw new Error(
      "ephemeral custody materialization is writable",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "ephemeral custody materialization is writable"
    ) {
      throw error;
    }
    const code =
      (error as NodeJS.ErrnoException).code;
    if (
      code !== "EACCES" &&
      code !== "EPERM" &&
      code !== "EROFS"
    ) {
      throw error;
    }
  }
}

async function consume(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const [contract, descriptor, release] =
    await Promise.all([
      loadContract(),
      readInput<SyntheticCustodyDescriptor>(
        "descriptor.json",
      ),
      readInput<{
        readonly releaseId: string;
      }>("release.json"),
    ]);
  await assertReadOnly(plaintextPath());
  const payload = await readFile(plaintextPath());
  if (config.consumerBehavior === "crash_after_read") {
    process.kill(process.pid, "SIGKILL");
  }
  if (config.consumerBehavior === "timeout") {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 60_000);
    });
  }
  const receipt =
    createSyntheticCustodyEvaluatorReceipt({
      receiptId:
        `custody-evaluator-receipt:${descriptor.custodyId}`,
      descriptor,
      releaseId: release.releaseId,
      observedPayload: payload,
      consumedAt: config.timestamp,
      signer,
      contract,
      schemas,
    });
  await writeJson(
    "evaluator-receipt.json",
    receipt as unknown as JsonValue,
  );
  await createRoleReceipt({
    config,
    schemas,
    signer,
    contract,
    inputCommitments: [
      descriptor.recordHash,
      descriptor.plaintextCommitment,
    ],
    outputCommitments: [receipt.recordHash],
    inertPayloadObserved: true,
  });
  payload.fill(0);
}

async function listFiles(
  root: string,
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, {
      withFileTypes: true,
    });
  } catch (error) {
    const code =
      (error as NodeJS.ErrnoException).code;
    if (
      code === "ENOENT" ||
      code === "EACCES" ||
      code === "EPERM"
    ) {
      return [];
    }
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(candidate)));
    } else if (entry.isFile()) {
      files.push(candidate);
    }
  }
  return files;
}

async function countMatches(
  root: string,
  needle: Buffer,
): Promise<number> {
  let matches = 0;
  for (const file of await listFiles(root)) {
    let bytes: Buffer;
    try {
      bytes = await readFile(file);
    } catch (error) {
      const code =
        (error as NodeJS.ErrnoException).code;
      if (
        code === "EACCES" ||
        code === "EPERM" ||
        code === "ENOENT"
      ) {
        continue;
      }
      throw error;
    }
    if (bytes.includes(needle)) matches += 1;
  }
  return matches;
}

async function countProcessArgumentMatches(
  needle: Buffer,
): Promise<number> {
  let matches = 0;
  const entries = await readdir("/proc", {
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      !/^[0-9]+$/u.test(entry.name)
    ) {
      continue;
    }
    try {
      const bytes = await readFile(
        `/proc/${entry.name}/cmdline`,
      );
      if (bytes.includes(needle)) matches += 1;
    } catch {
      continue;
    }
  }
  return matches;
}

function byteCommitment(
  bytes: Uint8Array,
): string {
  return `sha256:${sha256Bytes(bytes)}`;
}

function encodedCandidates(
  bytes: Buffer,
  length: number,
): readonly Buffer[] {
  const candidates: Buffer[] = [];
  if (bytes.length === length) candidates.push(bytes);
  const text = bytes.toString("utf8");
  for (const match of text.matchAll(
    /(?:^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{43})(?=$|[^A-Za-z0-9_-])/gu,
  )) {
    const decoded = Buffer.from(match[1]!, "base64url");
    if (decoded.length === length) candidates.push(decoded);
  }
  for (const match of text.matchAll(
    /(?:^|[^a-f0-9])([a-f0-9]{64})(?=$|[^a-f0-9])/gu,
  )) {
    const decoded = Buffer.from(match[1]!, "hex");
    if (decoded.length === length) candidates.push(decoded);
  }
  return candidates;
}

async function countCommitmentMatches(
  root: string,
  length: number,
  commitment: string,
): Promise<number> {
  let matches = 0;
  for (const file of await listFiles(root)) {
    let bytes: Buffer;
    try {
      bytes = await readFile(file);
    } catch (error) {
      const code =
        (error as NodeJS.ErrnoException).code;
      if (
        code === "EACCES" ||
        code === "EPERM" ||
        code === "ENOENT"
      ) {
        continue;
      }
      throw error;
    }
    if (
      encodedCandidates(bytes, length).some(
        (candidate) =>
          byteCommitment(candidate) === commitment,
      )
    ) {
      matches += 1;
    }
  }
  return matches;
}

async function countProcessArgumentCommitmentMatches(
  length: number,
  commitment: string,
): Promise<number> {
  let matches = 0;
  const entries = await readdir("/proc", {
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      !/^[0-9]+$/u.test(entry.name)
    ) {
      continue;
    }
    try {
      const bytes = await readFile(
        `/proc/${entry.name}/cmdline`,
      );
      if (
        encodedCandidates(bytes, length).some(
          (candidate) =>
            byteCommitment(candidate) === commitment,
        )
      ) {
        matches += 1;
      }
    } catch {
      continue;
    }
  }
  return matches;
}

function signHashRecord<T extends object>(
  core: T,
  signer: PrincipalSigner,
): T & SignedHashRecord {
  const publicPrincipal = signer.exportPublic();
  const signedBody = {
    ...core,
    recordHash: sha256(
      core as unknown as JsonValue,
    ),
    publicPrincipal,
  };
  return {
    ...signedBody,
    attestation: signer.attest(
      signedBody as unknown as JsonValue,
    ),
  };
}

async function cleanup(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const [contract, descriptor] =
    await Promise.all([
      loadContract(),
      readInput<SyntheticCustodyDescriptor>(
        "descriptor.json",
      ),
    ]);
  let request:
    SyntheticCustodyReleaseRequest | undefined;
  try {
    request =
      await readInput<SyntheticCustodyReleaseRequest>(
        "request.json",
      );
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !==
      "ENOENT"
    ) {
      throw error;
    }
  }
  const root = objectRoot(descriptor.custodyId);
  const key = (await exists(path.join(root, "key.bin")))
    ? await readFile(path.join(root, "key.bin"))
    : null;
  const payload = (await exists(plaintextPath()))
    ? await readFile(plaintextPath())
    : fixedInertSyntheticPayload();
  if (
    byteCommitment(payload) !==
    descriptor.plaintextCommitment
  ) {
    throw new HarnessError(
      "HASH_MISMATCH",
      "Synthetic custody cleanup payload commitment mismatch",
    );
  }
  if (
    key !== null &&
    byteCommitment(key) !== descriptor.keyCommitment
  ) {
    throw new HarnessError(
      "HASH_MISMATCH",
      "Synthetic custody cleanup key commitment mismatch",
    );
  }
  const journal = loadJournal({
    descriptor,
    contract,
    signer,
    schemas,
  });
  const cleanupReason = requireString(
    config.cleanupReason,
    "cleanupReason",
  ) as SyntheticCustodyCleanupReason;
  await journal.beginCleanup({
    reason: cleanupReason,
    occurredAt: config.timestamp,
    ...(request === undefined ? {} : { request }),
  });
  await rm(plaintextPath(), { force: true });
  if (config.crashAfterPlaintextDelete === true) {
    process.kill(process.pid, "SIGKILL");
  }
  await rm(root, { recursive: true, force: true });
  if (config.crashAfterPrivateDelete === true) {
    process.kill(process.pid, "SIGKILL");
  }
  const disposition = await journal.completeCleanup({
    reason: cleanupReason,
    occurredAt: config.timestamp,
    ...(request === undefined ? {} : { request }),
  });
  if (config.crashAfterCleanupCommit === true) {
    process.kill(process.pid, "SIGKILL");
  }
  const [
    repositoryPayloadMatches,
    repositoryKeyMatches,
    retainedStatePayloadMatches,
    retainedStateKeyMatches,
    logPayloadMatches,
    logKeyMatches,
    processArgumentPayloadMatches,
    processArgumentKeyMatches,
  ] = await Promise.all([
    countMatches(REPOSITORY_SCAN, payload),
    key === null
      ? countCommitmentMatches(
          REPOSITORY_SCAN,
          32,
          descriptor.keyCommitment,
        )
      : countMatches(REPOSITORY_SCAN, key),
    countMatches(RETAINED, payload),
    key === null
      ? countCommitmentMatches(
          RETAINED,
          32,
          descriptor.keyCommitment,
        )
      : countMatches(RETAINED, key),
    countMatches(LOGS, payload),
    key === null
      ? countCommitmentMatches(
          LOGS,
          32,
          descriptor.keyCommitment,
        )
      : countMatches(LOGS, key),
    countProcessArgumentMatches(payload),
    key === null
      ? countProcessArgumentCommitmentMatches(
          32,
          descriptor.keyCommitment,
        )
      : countProcessArgumentMatches(key),
  ]);
  const scanCore = {
    schemaVersion: 1 as const,
    recordType:
      "synthetic_custody_leakage_scan" as const,
    scanId:
      `custody-leakage-scan:${descriptor.custodyId}`,
    protocolId: descriptor.protocolId,
    contractHash: descriptor.contractHash,
    custodyId: descriptor.custodyId,
    descriptorHash: descriptor.recordHash,
    plaintextCommitment:
      descriptor.plaintextCommitment,
    keyCommitment: descriptor.keyCommitment,
    repositoryPayloadMatches,
    repositoryKeyMatches,
    retainedStatePayloadMatches,
    retainedStateKeyMatches,
    logPayloadMatches,
    logKeyMatches,
    processArgumentPayloadMatches,
    processArgumentKeyMatches,
    keyFilePresentAfterCleanup: await exists(
      path.join(root, "key.bin"),
    ),
    ciphertextFilePresentAfterCleanup:
      await exists(
        path.join(root, "envelope.json"),
      ),
    plaintextFilePresentAfterCleanup:
      await exists(plaintextPath()),
    scannedAt: config.timestamp,
    scannedBy: signer.identity,
  };
  const scan = signHashRecord(
    scanCore,
    signer,
  );
  schemas.validate(
    LEAKAGE_SCAN_SCHEMA_ID,
    scan as unknown as JsonValue,
  );
  await writeJson(
    "leakage-scan.json",
    scan as unknown as JsonValue,
  );
  await writeOperationResult({
    schemas,
    descriptor,
    disposition,
    materializationCreated: false,
  });
  await createRoleReceipt({
    config,
    schemas,
    signer,
    contract,
    inputCommitments: [
      descriptor.recordHash,
      descriptor.plaintextCommitment,
      descriptor.keyCommitment,
      ...(request === undefined
        ? []
        : [request.requestHash]),
    ],
    outputCommitments: [
      disposition.transition.recordHash,
      disposition.journalHead,
      scan.recordHash,
    ],
  });
  payload.fill(0);
  key?.fill(0);
}

async function commitmentProjection(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const [contract, descriptor, source] =
    await Promise.all([
      loadContract(),
      readInput<SyntheticCustodyDescriptor>(
        "descriptor.json",
      ),
      readInput<{
        readonly sourceReceiptHash: string;
        readonly cleanupTransitionHash: string;
      }>("projection-input.json"),
    ]);
  const projectionClass =
    config.mode === "scorer_projection"
      ? ("scorer_commitments_only" as const)
      : ("promoter_commitments_only" as const);
  const core = {
    schemaVersion: 1 as const,
    recordType:
      "synthetic_custody_commitment_projection" as const,
    projectionId:
      `custody-projection:${config.role}:${descriptor.custodyId}`,
    projectionClass,
    protocolId: descriptor.protocolId,
    contractHash: descriptor.contractHash,
    custodyId: descriptor.custodyId,
    descriptorHash: descriptor.recordHash,
    plaintextCommitment:
      descriptor.plaintextCommitment,
    sourceReceiptHash:
      source.sourceReceiptHash,
    cleanupTransitionHash:
      source.cleanupTransitionHash,
    taskBodyPresent: false as const,
    ciphertextPresent: false as const,
    keyPresent: false as const,
    plaintextPresent: false as const,
    rawTaskHandlePresent: false as const,
    observedAt: config.timestamp,
    observedBy: signer.identity,
  };
  const projection = signHashRecord(core, signer);
  schemas.validate(
    PROJECTION_SCHEMA_ID,
    projection as unknown as JsonValue,
  );
  await writeJson(
    "projection.json",
    projection as unknown as JsonValue,
  );
  await createRoleReceipt({
    config,
    schemas,
    signer,
    contract,
    inputCommitments: [
      descriptor.recordHash,
      descriptor.plaintextCommitment,
      source.sourceReceiptHash,
      source.cleanupTransitionHash,
    ],
    outputCommitments: [projection.recordHash],
  });
}

async function finalizeAudit(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const [contract, summary] = await Promise.all([
    loadContract(),
    readInput<{
      readonly descriptorHashes: readonly string[];
      readonly transitionHashes: readonly string[];
      readonly roleReceiptHashes: readonly string[];
      readonly leakageScanHashes: readonly string[];
      readonly scorerProjectionHash: string;
      readonly promoterProjectionHash: string;
    }>("audit-summary.json"),
  ]);
  const core = {
    schemaVersion: 1 as const,
    recordType:
      "synthetic_custody_final_audit" as const,
    protocolId: contract.protocolId,
    contractHash: contract.contractHash,
    descriptorHashes: [
      ...new Set(summary.descriptorHashes),
    ].sort(),
    transitionHashes: [
      ...new Set(summary.transitionHashes),
    ].sort(),
    roleReceiptHashes: [
      ...new Set(summary.roleReceiptHashes),
    ].sort(),
    leakageScanHashes: [
      ...new Set(summary.leakageScanHashes),
    ].sort(),
    scorerProjectionHash:
      summary.scorerProjectionHash,
    promoterProjectionHash:
      summary.promoterProjectionHash,
    taskBodyPresent: false as const,
    verifierLogicPresent: false as const,
    labelPresent: false as const,
    taskPathPresent: false as const,
    modelPromptPresent: false as const,
    providerUsed: false as const,
    researchEvidenceAuthorized: false as const,
    promotionAuthorized: false as const,
    finalizedAt: config.timestamp,
    finalizedBy: signer.identity,
  };
  const audit = signHashRecord(core, signer);
  schemas.validate(
    FINAL_AUDIT_SCHEMA_ID,
    audit as unknown as JsonValue,
  );
  await writeJson(
    "final-audit.json",
    audit as unknown as JsonValue,
  );
  await createRoleReceipt({
    config,
    schemas,
    signer,
    contract,
    inputCommitments: [
      ...summary.descriptorHashes,
      ...summary.transitionHashes,
      ...summary.roleReceiptHashes,
      ...summary.leakageScanHashes,
      summary.scorerProjectionHash,
      summary.promoterProjectionHash,
    ],
    outputCommitments: [audit.recordHash],
  });
}

function expectedRole(mode: WorkerMode): BoundaryRole {
  switch (mode) {
    case "seal_custody":
    case "reserve_release":
    case "materialize":
    case "cleanup":
    case "recover_cleanup":
    case "tamper_private_envelope":
    case "forge_substituted_capability":
      return "vault";
    case "sign_release":
    case "sign_substituted_release":
    case "consume":
      return "evaluator";
    case "scorer_projection":
      return "scorer";
    case "promoter_projection":
      return "promoter";
    case "finalize_audit":
      return "audit_store";
  }
}

async function main(): Promise<void> {
  const config = await loadConfiguration();
  if (
    !ROLE_NAMES.includes(config.role) ||
    config.role !== expectedRole(config.mode)
  ) {
    throw new Error(
      "synthetic custody worker role mismatch",
    );
  }
  const [schemas, signer] = await Promise.all([
    SchemaRegistry.load(SCHEMAS),
    loadSigner(),
  ]);
  if (signer.identity.role !== config.role) {
    throw new Error(
      "synthetic custody signing key role mismatch",
    );
  }
  switch (config.mode) {
    case "seal_custody":
      await sealCustody(config, signer, schemas);
      break;
    case "sign_release":
      await signRelease(config, signer, schemas);
      break;
    case "sign_substituted_release":
      await signSubstitutedRelease(
        config,
        signer,
        schemas,
      );
      break;
    case "reserve_release":
      await reserveRelease(config, signer, schemas);
      break;
    case "materialize":
      await materialize(config, signer, schemas);
      break;
    case "tamper_private_envelope":
      await tamperPrivateEnvelope(
        config,
        signer,
        schemas,
      );
      break;
    case "forge_substituted_capability":
      await forgeSubstitutedCapability(
        config,
        signer,
        schemas,
      );
      break;
    case "consume":
      await consume(config, signer, schemas);
      break;
    case "cleanup":
    case "recover_cleanup":
      await cleanup(config, signer, schemas);
      break;
    case "scorer_projection":
    case "promoter_projection":
      await commitmentProjection(
        config,
        signer,
        schemas,
      );
      break;
    case "finalize_audit":
      await finalizeAudit(config, signer, schemas);
      break;
  }
}

await main();
