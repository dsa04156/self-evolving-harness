import path from "node:path";

import {
  PrincipalSigner,
  SchemaRegistry,
  VaultWriterLease,
  type EvaluatorVaultContract,
  type PrincipalIdentity,
  type PublicPrincipal,
} from "../../src/index.js";

interface WorkerInput {
  readonly root: string;
  readonly ownerId: string;
  readonly ttlMillis: number;
  readonly contract: EvaluatorVaultContract;
  readonly signer: {
    readonly identity: PrincipalIdentity;
    readonly keyId: string;
    readonly privateKeyPem: string;
    readonly publicKeyPem: string;
  };
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
    const signer = PrincipalSigner.import({
      identity: input.signer.identity,
      keyId: input.signer.keyId,
      privateKeyPem: input.signer.privateKeyPem,
      publicKeyPem: input.signer.publicKeyPem,
    });
    const lease = new VaultWriterLease({
      root: input.root,
      ownerId: input.ownerId,
      contract: input.contract,
      schemas,
      vaultSigner: signer,
      ttlMillis: input.ttlMillis,
    });
    const handle = await lease.acquire();
    send({
      status: "acquired",
      epoch: handle.epoch,
      ownerCommitment: handle.ownerCommitment,
    });
    process.once("message", async (message: unknown) => {
      if (message !== "release") return;
      try {
        await lease.release(handle);
        send({ status: "released" });
        process.exitCode = 0;
        process.disconnect();
      } catch (error) {
        send({
          status: "release_error",
          code:
            typeof error === "object" &&
            error !== null &&
            "code" in error
              ? String(error.code)
              : "UNKNOWN",
        });
        process.exitCode = 1;
        process.disconnect();
      }
    });
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
    process.disconnect();
  }
});

send({ status: "ready" });
