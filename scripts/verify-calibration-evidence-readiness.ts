import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  CALIBRATION_EVIDENCE_READINESS_AUDIT_PATH,
  CALIBRATION_EVIDENCE_READINESS_PATH,
  GitCalibrationEvidenceReadinessArtifactReader,
  SchemaRegistry,
  parseStrictJson,
  verifyCalibrationEvidenceContractReadinessAgainstArtifacts,
  verifyCalibrationEvidenceReadinessAuditReceiptIndependent,
  type CalibrationEvidenceContractReadiness,
  type CalibrationEvidenceReadinessAuditReceipt,
} from "../src/index.js";

const schemas = await SchemaRegistry.load(path.resolve("schemas"));
const readinessBytes = await readFile(path.resolve(CALIBRATION_EVIDENCE_READINESS_PATH));
const receiptBytes = await readFile(path.resolve(CALIBRATION_EVIDENCE_READINESS_AUDIT_PATH));
const readiness = parseStrictJson(readinessBytes.toString("utf8")) as unknown as CalibrationEvidenceContractReadiness;
const receipt = parseStrictJson(receiptBytes.toString("utf8")) as unknown as CalibrationEvidenceReadinessAuditReceipt;
const reader = new GitCalibrationEvidenceReadinessArtifactReader(process.cwd());
const result = await verifyCalibrationEvidenceContractReadinessAgainstArtifacts({ record: readiness, schemas, reader });
verifyCalibrationEvidenceReadinessAuditReceiptIndependent({ receipt, readiness, readinessBytes, schemas });
process.stdout.write(`${JSON.stringify(result)}\n`);
