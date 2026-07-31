import {
  createPrivateKey,
  createPublicKey,
} from "node:crypto";

import { sha256Bytes } from "../core/canonical.js";
import {
  PrincipalSigner,
  type PrincipalRole,
} from "../trust/identity.js";

/**
 * Creates a reproducible identity for deterministic development evidence.
 * The fixed seed is public and must never be used for production authority.
 */
export function createDevelopmentFixturePrincipal(input: {
  readonly principalId: string;
  readonly role: PrincipalRole;
  readonly implementationDigest: string;
  readonly instanceId: string;
  readonly seedByte: number;
}): PrincipalSigner {
  if (
    !Number.isSafeInteger(input.seedByte) ||
    input.seedByte < 0 ||
    input.seedByte > 255
  ) {
    throw new RangeError("seedByte must be an unsigned byte");
  }
  const privateDer = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    Buffer.alloc(32, input.seedByte),
  ]);
  const privateKey = createPrivateKey({
    key: privateDer,
    format: "der",
    type: "pkcs8",
  });
  const publicKey = createPublicKey(privateKey);
  const publicDer = publicKey.export({
    type: "spki",
    format: "der",
  });
  return PrincipalSigner.import({
    identity: {
      principalId: input.principalId,
      role: input.role,
      identityDigest: `sha256:${sha256Bytes(publicDer)}`,
      implementationDigest: input.implementationDigest,
      instanceId: input.instanceId,
    },
    keyId: `${input.principalId}.development-ed25519`,
    privateKeyPem: privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    publicKeyPem: publicKey
      .export({ type: "spki", format: "pem" })
      .toString(),
  });
}
