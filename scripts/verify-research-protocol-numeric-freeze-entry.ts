import {
  verifyResearchProtocolNumericFreezeEntryFiles,
} from "../src/index.js";

const result =
  await verifyResearchProtocolNumericFreezeEntryFiles({
    repositoryRoot: process.cwd(),
  });

process.stdout.write(`${JSON.stringify(result)}\n`);
