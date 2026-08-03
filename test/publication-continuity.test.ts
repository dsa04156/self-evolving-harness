import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPublicationContinuity,
  detectSecretPatternLabels,
  isEnvironmentArtifactPath,
  parseRemoteHeadObservation,
} from "../src/index.js";

const corrective = "1".repeat(40);
const remote = "2".repeat(40);
const local = "3".repeat(40);

test("remote publication observation is exact and unambiguous", () => {
  assert.equal(
    parseRemoteHeadObservation(
      `${remote}\trefs/heads/main\n`,
    ),
    remote,
  );
  assert.throws(() =>
    parseRemoteHeadObservation(
      `${remote}\trefs/heads/main\n${local}\trefs/heads/other\n`,
    ),
  );
  assert.throws(() =>
    parseRemoteHeadObservation(
      `${remote}\trefs/heads/release\n`,
    ),
  );
});

test("publication continuity admits equal or fast-forward heads", () => {
  assert.doesNotThrow(() =>
    assertPublicationContinuity({
      requiredAncestorCommit: corrective,
      remoteCommit: remote,
      localCommit: local,
      remoteDescendsFromRequiredAncestor: true,
      localDescendsFromRemote: true,
    }),
  );
  assert.doesNotThrow(() =>
    assertPublicationContinuity({
      requiredAncestorCommit: corrective,
      remoteCommit: local,
      localCommit: local,
      remoteDescendsFromRequiredAncestor: true,
      localDescendsFromRemote: true,
    }),
  );
});

test("publication continuity rejects rewritten or divergent history", () => {
  assert.throws(() =>
    assertPublicationContinuity({
      requiredAncestorCommit: corrective,
      remoteCommit: remote,
      localCommit: local,
      remoteDescendsFromRequiredAncestor: false,
      localDescendsFromRemote: true,
    }),
  );
  assert.throws(() =>
    assertPublicationContinuity({
      requiredAncestorCommit: corrective,
      remoteCommit: remote,
      localCommit: local,
      remoteDescendsFromRequiredAncestor: true,
      localDescendsFromRemote: false,
    }),
  );
});

test("post-corrective secret scan detects credentials without flagging the governed sentinel", () => {
  const syntheticProviderKey =
    "sk-" + "a".repeat(40);
  const syntheticGithubToken =
    "ghp_" + "b".repeat(36);
  assert.deepEqual(
    detectSecretPatternLabels(
      Buffer.from(
        `${syntheticProviderKey} ${syntheticGithubToken}`,
      ),
    ),
    ["provider-secret-key", "github-token"],
  );
  assert.deepEqual(
    detectSecretPatternLabels(
      Buffer.from("sk-validation-mode-must-ignore-this"),
    ),
    [],
  );
});

test("environment paths exclude public templates only", () => {
  assert.equal(isEnvironmentArtifactPath(".env"), true);
  assert.equal(
    isEnvironmentArtifactPath("config/.env.production"),
    true,
  );
  assert.equal(
    isEnvironmentArtifactPath("config/.env.example"),
    false,
  );
  assert.equal(isEnvironmentArtifactPath("docs/env.md"), false);
});
