import {
  readFile,
} from "node:fs/promises";
import path from "node:path";

import {
  EvaluatorVault,
  HistoricalPublicExposurePolicy,
  PrincipalSigner,
  SchemaRegistry,
  parseStrictJson,
  type EvaluatorVaultContract,
  type HistoricalPublicExposureLedger,
  type HistoricalPublicObjectInventory,
  type PrincipalIdentity,
  type PublicationDeviationRecord,
  type PublicExposureLedger,
  type PublishedArtifactInventory,
  type VaultAccessRequest,
  type VaultAuthorshipAdmission,
} from "../../src/index.js";

interface WorkerInput {
  readonly root: string;
  readonly ownerId: string;
  readonly contract: EvaluatorVaultContract;
  readonly signer: {
    readonly identity: PrincipalIdentity;
    readonly keyId: string;
    readonly privateKeyPem: string;
    readonly publicKeyPem: string;
  };
  readonly authorshipAdmissions:
    readonly VaultAuthorshipAdmission[];
  readonly request: VaultAccessRequest;
}

async function readJson<T>(
  filePath: string,
): Promise<T> {
  return parseStrictJson(
    await readFile(path.resolve(filePath), "utf8"),
  ) as unknown as T;
}

function send(value: unknown): void {
  process.send?.(value);
}

process.once("message", async (raw: unknown) => {
  const input = raw as WorkerInput;
  try {
    const schemas = await SchemaRegistry.load(
      path.resolve("schemas"),
    );
    const [
      priorInventory,
      priorLedger,
      deviation,
      historicalInventory,
      historicalLedger,
    ] = await Promise.all([
      readJson<PublishedArtifactInventory>(
        "governance/public-exposure/inventory-a5d8256.json",
      ),
      readJson<PublicExposureLedger>(
        "governance/public-exposure/ledger-a5d8256.json",
      ),
      readJson<PublicationDeviationRecord>(
        "governance/publication-deviations/github-publication-2026-07-31.json",
      ),
      readJson<HistoricalPublicObjectInventory>(
        "governance/public-exposure/historical-inventory-through-8b5f144.json",
      ),
      readJson<HistoricalPublicExposureLedger>(
        "governance/public-exposure/historical-ledger-through-8b5f144.json",
      ),
    ]);
    const historicalPolicy =
      new HistoricalPublicExposurePolicy({
        ledger: historicalLedger,
        deviation,
        priorInventory,
        priorLedger,
        historicalInventory,
        schemas,
      });
    const signer = PrincipalSigner.import({
      identity: input.signer.identity,
      keyId: input.signer.keyId,
      privateKeyPem: input.signer.privateKeyPem,
      publicKeyPem: input.signer.publicKeyPem,
    });
    const vault = new EvaluatorVault({
      root: input.root,
      contract: input.contract,
      schemas,
      vaultSigner: signer,
      historicalPolicy,
      authorshipAdmissions:
        input.authorshipAdmissions,
      leaseOwnerId: input.ownerId,
    });
    const outcome = await vault.process(input.request);
    send({ status: "success", outcome });
    process.exitCode = 0;
  } catch (error) {
    send({
      status: "error",
      code:
        typeof error === "object" &&
        error !== null &&
        "code" in error
          ? String(error.code)
          : "UNKNOWN",
    });
    process.exitCode = 2;
  } finally {
    process.disconnect();
  }
});

send({ status: "ready" });
