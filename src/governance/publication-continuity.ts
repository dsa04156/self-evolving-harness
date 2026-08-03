const GIT_OBJECT_ID = /^[a-f0-9]{40}$/u;

const SECRET_PATTERNS = Object.freeze([
  {
    label: "private-key-pem",
    pattern:
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  },
  {
    label: "provider-secret-key",
    pattern: /\bsk-[A-Za-z0-9_-]{32,}\b/u,
  },
  {
    label: "github-token",
    pattern:
      /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{30,}\b/u,
  },
  {
    label: "aws-access-key",
    pattern: /\bAKIA[A-Z0-9]{16}\b/u,
  },
] as const);

export const PUBLICATION_SECRET_FALSE_POSITIVES =
  Object.freeze(["sk-validation-mode-must-ignore-this"]);

export function parseRemoteHeadObservation(
  output: string,
  expectedRef = "refs/heads/main",
): string {
  const lines = output
    .trim()
    .split("\n")
    .filter((line) => line.length > 0);
  if (lines.length !== 1) {
    throw new Error(
      "Remote publication observation must contain exactly one ref",
    );
  }
  const match = /^([a-f0-9]{40})\t(.+)$/u.exec(lines[0]!);
  if (
    match === null ||
    match[2] !== expectedRef ||
    !GIT_OBJECT_ID.test(match[1]!)
  ) {
    throw new Error(
      "Remote publication observation is malformed or names the wrong ref",
    );
  }
  return match[1]!;
}

export function assertPublicationContinuity(input: {
  readonly requiredAncestorCommit: string;
  readonly remoteCommit: string;
  readonly localCommit: string;
  readonly remoteDescendsFromRequiredAncestor: boolean;
  readonly localDescendsFromRemote: boolean;
}): void {
  for (const [label, commit] of [
    ["required ancestor", input.requiredAncestorCommit],
    ["remote", input.remoteCommit],
    ["local", input.localCommit],
  ] as const) {
    if (!GIT_OBJECT_ID.test(commit)) {
      throw new Error(`${label} publication commit is malformed`);
    }
  }
  if (!input.remoteDescendsFromRequiredAncestor) {
    throw new Error(
      "Remote publication history no longer contains the required public ancestor",
    );
  }
  if (!input.localDescendsFromRemote) {
    throw new Error(
      "Local release candidate is not a fast-forward continuation of the remote",
    );
  }
}

export function isEnvironmentArtifactPath(
  filePath: string,
): boolean {
  const name = filePath.split("/").at(-1) ?? filePath;
  return (
    name === ".env" ||
    (/^\.env\./u.test(name) &&
      !/\.(?:example|sample|template|dist)$/u.test(name))
  );
}

export function detectSecretPatternLabels(
  bytes: Uint8Array,
): readonly string[] {
  if (bytes.includes(0)) return [];
  let text = Buffer.from(bytes).toString("utf8");
  for (const literal of PUBLICATION_SECRET_FALSE_POSITIVES) {
    text = text.replaceAll(literal, "");
  }
  return SECRET_PATTERNS.filter(({ pattern }) =>
    pattern.test(text),
  ).map(({ label }) => label);
}
