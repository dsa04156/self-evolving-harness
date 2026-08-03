import path from "node:path";

import { verifyCalibrationContractFiles } from "../src/index.js";

const result = await verifyCalibrationContractFiles({
  repositoryRoot: path.resolve("."),
});
process.stdout.write(`${JSON.stringify(result)}\n`);
