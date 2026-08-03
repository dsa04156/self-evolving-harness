#!/usr/bin/env node

import("../dist/src/cli.js").catch((error) => {
  const detail = error instanceof Error ? error.message : "Unknown CLI bootstrap failure";
  process.stderr.write(`SEH CLI is not built: ${detail}\nRun \`npm run build\` in the package checkout.\n`);
  process.exitCode = 1;
});
