import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  canonicalBytes,
  ExternalEvaluatorClient,
  PrincipalRegistry,
  PrincipalSigner,
  RandomIdFactory,
  SchemaRegistry,
  sha256,
  SystemClock,
  UnixAuditClient,
  type EvaluationBudgetUsage,
  type JsonValue,
  type PrincipalIdentity,
  type PublicPrincipal,
} from "../src/index.js";

interface OperationsConfiguration {
  readonly protocolId: string;
  readonly stateRoot: string;
  readonly schemaDirectory: string;
  readonly pythonExecutable: string;
  readonly relayScriptPath: string;
  readonly auditSocketPath: string;
  readonly evaluatorSocketPath: string;
  readonly expectedAuditUid: number;
  readonly expectedAuditGid: number;
  readonly expectedEvaluatorUid: number;
  readonly expectedEvaluatorGid: number;
  readonly candidateFilesystemSnapshotHash: string;
  readonly candidateBundleId: string;
  readonly parentHarnessVersionId: string;
  readonly candidateHarnessVersionId: string;
  readonly operations: PublicPrincipal & { readonly privateKeyPath: string };
  readonly audit: PublicPrincipal;
  readonly evaluator: PublicPrincipal;
  readonly outputPath: string;
}

const digest = (character: string): string => `sha256:${character.repeat(64)}`;
const usage: EvaluationBudgetUsage = {
  modelRequestAttempts: 2,
  completedModelCalls: 2,
  failedModelCalls: 0,
  cancelledModelCalls: 0,
  inputTokens: 20,
  outputTokens: 10,
  reasoningTokens: 0,
  cachedInputTokens: 0,
  totalChargedTokens: 30,
  providerCostMicros: 0,
  toolCalls: 2,
  feedbackEvents: 0,
  wallClockMillis: 10,
};

function asConfiguration(value: JsonValue): OperationsConfiguration {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("operations configuration is not an object");
  }
  return value as unknown as OperationsConfiguration;
}

async function main(): Promise<void> {
  const configPath = process.argv[2];
  if (configPath === undefined) throw new Error("configuration path is required");
  const config = asConfiguration(
    JSON.parse(await readFile(path.resolve(configPath), "utf8")) as JsonValue,
  );
  const operationsSigner = PrincipalSigner.import({
    identity: config.operations.identity as PrincipalIdentity,
    keyId: config.operations.keyId,
    privateKeyPem: await readFile(config.operations.privateKeyPath, "utf8"),
    publicKeyPem: config.operations.publicKeyPem,
  });
  const principals = new PrincipalRegistry();
  principals.register(config.operations);
  principals.register(config.audit);
  principals.register(config.evaluator);
  const schemas = await SchemaRegistry.load(config.schemaDirectory);
  const clock = new SystemClock();
  const ids = new RandomIdFactory();
  const audit = new UnixAuditClient({
    protocolId: config.protocolId,
    endpoint: {
      socketPath: config.auditSocketPath,
      expectedAuditUid: config.expectedAuditUid,
      expectedAuditGid: config.expectedAuditGid,
      pythonExecutable: config.pythonExecutable,
      relayScriptPath: config.relayScriptPath,
    },
    schemas,
    operationsSigner,
    auditPrincipal: config.audit,
    principals,
    clock,
    ids,
  });
  const evaluator = new ExternalEvaluatorClient({
    root: config.stateRoot,
    protocolId: config.protocolId,
    endpoint: {
      socketPath: config.evaluatorSocketPath,
      expectedEvaluatorUid: config.expectedEvaluatorUid,
      expectedEvaluatorGid: config.expectedEvaluatorGid,
      pythonExecutable: config.pythonExecutable,
      relayScriptPath: config.relayScriptPath,
    },
    evaluatorPrincipal: config.evaluator,
    schemas,
    audit,
    operationsSigner,
    principals,
    clock,
    ids,
  });
  try {
    await audit.start();
    await evaluator.start();
    const result = await evaluator.evaluate({
      methodId: "B6",
      parentHarnessVersionId: config.parentHarnessVersionId,
      candidateHarnessVersionId: config.candidateHarnessVersionId,
      candidateFilesystemSnapshotHash:
        config.candidateFilesystemSnapshotHash,
      runtimeStateSnapshotIds: [`rss-sha256:${"3".repeat(64)}`],
      rolloutSeeds: [17],
      manifestPins: {
        protocol: digest("1"),
        budget: digest("2"),
        modelConfiguration: digest("3"),
        split: digest("4"),
        evaluator: digest("5"),
        environment: digest("6"),
        toolchain: digest("7"),
        statisticalPlan: digest("8"),
      },
      taskPairs: [
        {
          opaqueTaskHandleHash: digest("a"),
          rolloutSeed: 17,
          parentPassed: true,
          candidatePassed: true,
          parentReceiptId: "receipt-parent-001",
          candidateReceiptId: "receipt-candidate-001",
        },
        {
          opaqueTaskHandleHash: digest("b"),
          rolloutSeed: 17,
          parentPassed: false,
          candidatePassed: true,
          parentReceiptId: "receipt-parent-002",
          candidateReceiptId: "receipt-candidate-002",
        },
      ],
      totalUsage: usage,
      pairedCi95LowerPercentagePointMicros: 0,
      pairedCi95UpperPercentagePointMicros: 100_000_000,
      sourceEvidenceReceiptIds: ["receipt-source-001"],
    });
    await evaluator.verifyTransactions();
    await audit.verifyAll();
    await writeFile(
      config.outputPath,
      canonicalBytes({
        schemaVersion: 1,
        isolationClass: evaluator.isolationClass,
        nodeVersion: process.version,
        operationsUid: process.getuid?.() ?? -1,
        operationsGid: process.getgid?.() ?? -1,
        auditPeer: audit.peerCredentials as unknown as JsonValue,
        evaluatorPeer: evaluator.peerCredentials as unknown as JsonValue,
        evaluationResultId: result.evaluationResultId,
        evaluationResultHash: sha256(result as unknown as JsonValue),
        auditIdentityDigest: config.audit.identity.identityDigest,
        evaluatorIdentityDigest: result.evaluator.identityDigest,
        candidateFilesystemSnapshotHash:
          result.candidateFilesystemSnapshotHash,
        candidateBundleId: config.candidateBundleId,
        candidateHarnessVersionId: result.candidateHarnessVersionId,
        passToFailCount: result.aggregate.passToFailCount,
        failToPassCount: result.aggregate.failToPassCount,
      }),
      { mode: 0o600 },
    );
  } finally {
    await evaluator.stop();
    await audit.stop();
  }
}

await main();
