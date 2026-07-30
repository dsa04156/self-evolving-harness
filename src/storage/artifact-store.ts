import { constants } from "node:fs";
import { link, mkdir, open, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import {
  canonicalBytes,
  constantTimeEqual,
  sha256Bytes,
  type JsonValue,
} from "../core/canonical.js";
import { HarnessError, assertCondition } from "../core/errors.js";
import type { ArtifactReference } from "../domain/components.js";

const HASH_PATTERN = /^sha256:([a-f0-9]{64})$/u;

export type ArtifactMediaType =
  | "application/json"
  | "application/vnd.seh.policy+json"
  | "application/vnd.seh.workflow+json"
  | "application/vnd.seh.skill+json"
  | "text/plain; charset=utf-8"
  | "text/markdown; charset=utf-8"
  | "application/octet-stream";

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class ArtifactStore {
  readonly #root: string;
  readonly #maxBytes: number;

  public constructor(root: string, maxBytes = 16 * 1024 * 1024) {
    assertCondition(maxBytes > 0, "SCHEMA_INVALID", "Artifact limit must be positive");
    this.#root = path.resolve(root);
    this.#maxBytes = maxBytes;
  }

  public async initialize(): Promise<void> {
    await mkdir(path.join(this.#root, "sha256"), { recursive: true, mode: 0o700 });
  }

  public async put(
    bytes: Uint8Array,
    mediaType: ArtifactMediaType,
    redacted = false,
  ): Promise<ArtifactReference> {
    assertCondition(
      bytes.byteLength <= this.#maxBytes,
      "PAYLOAD_TOO_LARGE",
      `Artifact exceeds ${this.#maxBytes} bytes`,
    );
    const digest = sha256Bytes(bytes);
    const contentHash = `sha256:${digest}` as const;
    const destination = this.#pathFor(contentHash);
    const directory = path.dirname(destination);
    await mkdir(directory, { recursive: true, mode: 0o700 });

    try {
      await stat(destination);
      await this.#verifyExisting(destination, bytes);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const suffix = randomBytes(16).toString("hex");
      const temporary = path.join(directory, `.${digest}.${suffix}.tmp`);
      const handle = await open(
        temporary,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await link(temporary, destination);
        await unlink(temporary);
        await syncDirectory(directory);
      } catch (linkError) {
        await unlink(temporary).catch(() => undefined);
        if ((linkError as NodeJS.ErrnoException).code !== "EEXIST") {
          throw linkError;
        }
        await this.#verifyExisting(destination, bytes);
      }
    }

    return {
      contentHash,
      mediaType,
      sizeBytes: bytes.byteLength,
      redacted,
    };
  }

  public async putJson(
    value: JsonValue,
    mediaType: ArtifactMediaType = "application/json",
  ): Promise<ArtifactReference> {
    return this.put(canonicalBytes(value), mediaType);
  }

  public async get(contentHash: string): Promise<Buffer> {
    const artifactPath = this.#pathFor(contentHash);
    let handle;
    try {
      handle = await open(artifactPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new HarnessError("ARTIFACT_UNAVAILABLE", `Missing artifact ${contentHash}`);
      }
      throw error;
    }
    try {
      const metadata = await handle.stat();
      assertCondition(metadata.isFile(), "ARTIFACT_UNAVAILABLE", "Artifact is not a regular file");
      assertCondition(metadata.nlink === 1, "HASH_MISMATCH", "Artifact has an external hard link");
      assertCondition(
        metadata.size <= this.#maxBytes,
        "PAYLOAD_TOO_LARGE",
        "Stored artifact exceeds configured limit",
      );
      const bytes = await handle.readFile();
      const observedHash = `sha256:${sha256Bytes(bytes)}`;
      assertCondition(
        constantTimeEqual(observedHash, contentHash),
        "HASH_MISMATCH",
        `Artifact hash mismatch for ${contentHash}`,
      );
      return bytes;
    } finally {
      await handle.close();
    }
  }

  public async verify(reference: ArtifactReference): Promise<void> {
    const bytes = await this.get(reference.contentHash);
    assertCondition(
      bytes.byteLength === reference.sizeBytes,
      "HASH_MISMATCH",
      `Artifact size mismatch for ${reference.contentHash}`,
    );
  }

  #pathFor(contentHash: string): string {
    const match = HASH_PATTERN.exec(contentHash);
    assertCondition(match !== null, "SCHEMA_INVALID", "Invalid artifact hash");
    const digest = match[1]!;
    return path.join(this.#root, "sha256", digest.slice(0, 2), digest);
  }

  async #verifyExisting(destination: string, expected: Uint8Array): Promise<void> {
    const handle = await open(destination, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const metadata = await handle.stat();
      assertCondition(metadata.isFile(), "HASH_MISMATCH", "Artifact path is not a regular file");
      assertCondition(metadata.nlink === 1, "HASH_MISMATCH", "Artifact has an external hard link");
      const actual = await handle.readFile();
      const equal =
        actual.byteLength === expected.byteLength &&
        Buffer.compare(actual, Buffer.from(expected)) === 0;
      assertCondition(equal, "HASH_MISMATCH", "Content-address collision or corruption");
    } finally {
      await handle.close();
    }
  }
}
