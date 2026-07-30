import { createPrivateKey, createPublicKey } from "node:crypto";

import {
  PrincipalSigner,
  sha256Bytes,
  type PrincipalRole,
} from "../../src/index.js";

export function deterministicPrincipal(input: {
  principalId: string;
  role: PrincipalRole;
  implementationDigest: string;
  instanceId: string;
  seedByte: number;
}): PrincipalSigner {
  if (
    !Number.isSafeInteger(input.seedByte) ||
    input.seedByte < 0 ||
    input.seedByte > 255
  ) {
    throw new Error("seedByte must be an unsigned byte");
  }
  // RFC 8410 PKCS#8 wrapper around a fixed 32-byte Ed25519 seed. This is
  // deliberately test-only and must never be used for production identities.
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
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  return PrincipalSigner.import({
    identity: {
      principalId: input.principalId,
      role: input.role,
      identityDigest: `sha256:${sha256Bytes(publicDer)}`,
      implementationDigest: input.implementationDigest,
      instanceId: input.instanceId,
    },
    keyId: `${input.principalId}.test-ed25519`,
    privateKeyPem: privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    publicKeyPem: publicKey
      .export({ type: "spki", format: "pem" })
      .toString(),
  });
}
