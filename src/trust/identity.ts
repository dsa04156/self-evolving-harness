import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

import {
  canonicalBytes,
  constantTimeEqual,
  sha256Bytes,
  type JsonValue,
} from "../core/canonical.js";
import { HarnessError, assertCondition } from "../core/errors.js";

export type PrincipalRole =
  | "runtime"
  | "operations_owner"
  | "proposer"
  | "evaluator"
  | "promoter"
  | "audit_store"
  | "model_provider_proxy"
  | "benchmark_author"
  | "protocol_author"
  | "human_operator"
  | "fake_provider";

export interface PrincipalIdentity {
  readonly principalId: string;
  readonly role: PrincipalRole;
  readonly identityDigest: string;
  readonly implementationDigest: string;
  readonly instanceId: string;
  readonly modelIdentityHash?: string | null;
}

export interface Attestation {
  readonly keyId: string;
  readonly algorithm: "Ed25519";
  readonly signature: string;
}

export interface PublicPrincipal {
  readonly identity: PrincipalIdentity;
  readonly keyId: string;
  readonly publicKeyPem: string;
}

function publicKeyDigest(publicKey: KeyObject): string {
  const der = publicKey.export({ type: "spki", format: "der" });
  return `sha256:${sha256Bytes(der)}`;
}

export class PrincipalSigner {
  readonly identity: PrincipalIdentity;
  readonly keyId: string;
  readonly #privateKey: KeyObject;
  readonly #publicKey: KeyObject;

  private constructor(
    identity: PrincipalIdentity,
    keyId: string,
    privateKey: KeyObject,
    publicKey: KeyObject,
  ) {
    this.identity = identity;
    this.keyId = keyId;
    this.#privateKey = privateKey;
    this.#publicKey = publicKey;
  }

  public static generate(input: {
    principalId: string;
    role: PrincipalRole;
    implementationDigest: string;
    instanceId: string;
    modelIdentityHash?: string | null;
    keyId?: string;
  }): PrincipalSigner {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const identity: PrincipalIdentity = {
      principalId: input.principalId,
      role: input.role,
      identityDigest: publicKeyDigest(publicKey),
      implementationDigest: input.implementationDigest,
      instanceId: input.instanceId,
      ...(input.modelIdentityHash === undefined
        ? {}
        : { modelIdentityHash: input.modelIdentityHash }),
    };
    return new PrincipalSigner(
      identity,
      input.keyId ?? `${input.principalId}.ed25519`,
      privateKey,
      publicKey,
    );
  }

  public static import(input: {
    identity: PrincipalIdentity;
    keyId: string;
    privateKeyPem: string;
    publicKeyPem: string;
  }): PrincipalSigner {
    const privateKey = createPrivateKey(input.privateKeyPem);
    const publicKey = createPublicKey(input.publicKeyPem);
    assertCondition(
      constantTimeEqual(input.identity.identityDigest, publicKeyDigest(publicKey)),
      "AUTHENTICATION_FAILED",
      "Principal identity digest does not match its public key",
    );
    return new PrincipalSigner(input.identity, input.keyId, privateKey, publicKey);
  }

  public attest(value: JsonValue): Attestation {
    return {
      keyId: this.keyId,
      algorithm: "Ed25519",
      signature: sign(null, canonicalBytes(value), this.#privateKey).toString("base64url"),
    };
  }

  public exportPublic(): PublicPrincipal {
    return {
      identity: this.identity,
      keyId: this.keyId,
      publicKeyPem: this.#publicKey.export({ type: "spki", format: "pem" }).toString(),
    };
  }

  public exportPrivatePem(): string {
    return this.#privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  }
}

export class PrincipalRegistry {
  readonly #principals = new Map<
    string,
    { readonly identity: PrincipalIdentity; readonly publicKey: KeyObject }
  >();

  public register(principal: PublicPrincipal): void {
    assertCondition(
      !this.#principals.has(principal.keyId),
      "CONFLICT",
      `Duplicate key ${principal.keyId}`,
    );
    const publicKey = createPublicKey(principal.publicKeyPem);
    assertCondition(
      constantTimeEqual(principal.identity.identityDigest, publicKeyDigest(publicKey)),
      "AUTHENTICATION_FAILED",
      "Registered public key does not match identity digest",
    );
    this.#principals.set(principal.keyId, { identity: principal.identity, publicKey });
  }

  public verify(
    claimedIdentity: PrincipalIdentity,
    value: JsonValue,
    attestation: Attestation,
  ): void {
    assertCondition(
      attestation.algorithm === "Ed25519",
      "AUTHENTICATION_FAILED",
      "Unsupported signature algorithm",
    );
    assertCondition(
      /^[A-Za-z0-9_-]{80,128}$/u.test(attestation.signature),
      "AUTHENTICATION_FAILED",
      "Malformed signature",
    );
    const principal = this.#principals.get(attestation.keyId);
    if (principal === undefined) {
      throw new HarnessError("AUTHENTICATION_FAILED", "Unknown signing key");
    }
    assertCondition(
      constantTimeEqual(
        canonicalBytes(principal.identity as unknown as JsonValue).toString("base64url"),
        canonicalBytes(claimedIdentity as unknown as JsonValue).toString("base64url"),
      ),
      "AUTHENTICATION_FAILED",
      "Claimed principal identity does not match registered identity",
    );
    const signature = Buffer.from(attestation.signature, "base64url");
    assertCondition(
      verify(null, canonicalBytes(value), principal.publicKey, signature),
      "AUTHENTICATION_FAILED",
      "Invalid Ed25519 signature",
    );
  }
}
