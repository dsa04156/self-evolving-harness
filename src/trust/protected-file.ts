import { constants } from "node:fs";
import { open } from "node:fs/promises";

import { assertCondition } from "../core/errors.js";

export async function readProtectedUtf8(input: {
  readonly file: string;
  readonly expectedUid: number;
  readonly expectedGid: number;
  readonly maxBytes: number;
}): Promise<string> {
  const handle = await open(
    input.file,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const metadata = await handle.stat();
    assertCondition(
      metadata.isFile() &&
        metadata.nlink === 1 &&
        metadata.uid === input.expectedUid &&
        metadata.gid === input.expectedGid &&
        (metadata.mode & 0o077) === 0 &&
        metadata.size > 0 &&
        metadata.size <= input.maxBytes,
      "AUTHENTICATION_FAILED",
      "Protected file ownership, mode, links, or size is invalid",
    );
    return handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}
