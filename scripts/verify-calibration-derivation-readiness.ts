import {
  verifyCalibrationDerivationReadinessFiles,
} from "../src/index.js";

const result = await verifyCalibrationDerivationReadinessFiles(process.cwd());
process.stdout.write(`${JSON.stringify(result)}\n`);
