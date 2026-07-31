import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalRequestTableProvider,
  HarnessError,
  canonicalModelRequestProjectionHash,
  type ModelRequest,
} from "../src/index.js";

function request(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return {
    requestId: "ephemeral-1",
    modelIdentity: "fake-model-v1",
    instructions: "Return the observable marker.",
    input: [
      {
        kind: "text",
        role: "user",
        content: "Perform the task.",
      },
    ],
    tools: [],
    maxOutputTokens: 128,
    ...overrides,
  };
}

test("request table ignores requestId but reacts to behavioral input", async () => {
  const registered = request();
  const provider = new CanonicalRequestTableProvider({
    rows: [
      {
        requestProjectionHash:
          canonicalModelRequestProjectionHash(registered),
        output: [
          {
            kind: "assistant_message",
            text: "SEMANTIC_OK",
          },
        ],
      },
    ],
  });

  const matched = await provider.generate(
    request({ requestId: "another-ephemeral-id" }),
  );
  const rejected = await provider.generate(
    request({ instructions: "Different behavioral instructions." }),
  );

  assert.equal(matched.output[0]?.kind, "assistant_message");
  assert.equal(
    matched.output[0]?.kind === "assistant_message"
      ? matched.output[0].text
      : null,
    "SEMANTIC_OK",
  );
  assert.equal(
    rejected.output[0]?.kind === "assistant_message"
      ? rejected.output[0].text
      : null,
    "SEMANTIC_REJECTED",
  );
  assert.deepEqual(
    provider.observations.map((entry) => entry.matched),
    [true, false],
  );
});

test("request table rejects duplicate projection keys", () => {
  const key = canonicalModelRequestProjectionHash(request());
  assert.throws(
    () =>
      new CanonicalRequestTableProvider({
        rows: [
          {
            requestProjectionHash: key,
            output: [{ kind: "assistant_message", text: "one" }],
          },
          {
            requestProjectionHash: key,
            output: [{ kind: "assistant_message", text: "two" }],
          },
        ],
      }),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "CONFLICT",
  );
});
