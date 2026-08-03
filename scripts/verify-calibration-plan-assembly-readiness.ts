import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  CALIBRATION_PLAN_ASSEMBLY_READINESS_AUDIT_PATH,
  CALIBRATION_PLAN_ASSEMBLY_READINESS_PATH,
  GitCalibrationPlanAssemblyArtifactReader,
  PythonCalibrationPortabilityReferenceExecutor,
  SchemaRegistry,
  parseStrictJson,
  verifyCalibrationPlanAssemblyAuditReceiptIndependent,
  type CalibrationPlanAssemblyAuditReceipt,
  type CalibrationPlanAssemblyReadiness,
} from "../src/index.js";

const schemas = await SchemaRegistry.load(path.resolve("schemas"));
const readinessBytes = await readFile(path.resolve(CALIBRATION_PLAN_ASSEMBLY_READINESS_PATH));
const receiptBytes = await readFile(path.resolve(CALIBRATION_PLAN_ASSEMBLY_READINESS_AUDIT_PATH));
const readiness = parseStrictJson(readinessBytes.toString("utf8")) as unknown as CalibrationPlanAssemblyReadiness;
const receipt = parseStrictJson(receiptBytes.toString("utf8")) as unknown as CalibrationPlanAssemblyAuditReceipt;
const result = await verifyCalibrationPlanAssemblyAuditReceiptIndependent({
  receipt,
  readiness,
  readinessBytes,
  schemas,
  reader: new GitCalibrationPlanAssemblyArtifactReader(process.cwd()),
  portabilityReference: new PythonCalibrationPortabilityReferenceExecutor(),
});
process.stdout.write(`${JSON.stringify(result)}\n`);
