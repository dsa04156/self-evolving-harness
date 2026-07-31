import path from "node:path";

import { verifyTrustPlaneAggregate } from "../src/index.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const result = await verifyTrustPlaneAggregate({
  repositoryRoot: process.cwd(),
  manifestPath:
    option("--manifest") ??
    "governance/trust-plane/conformance-manifest.json",
});

process.stdout.write(`${JSON.stringify(result)}\n`);
