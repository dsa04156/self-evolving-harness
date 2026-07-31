import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

import {
  canonicalize,
  parseStrictJson,
  sha256,
  sha256Bytes,
  type JsonValue,
} from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import type { NonPromotableHarnessRegistry } from "../governance/non-promotable-harness.js";
import {
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalSigner,
  type PublicPrincipal,
} from "../trust/identity.js";
import type { DevelopmentClaimBoundary } from "../evaluation/development-attribution.js";
import {
  assertDevelopmentCandidateDestination,
  type DevelopmentMutationDryRunRecord,
} from "./development-mutation-dry-run.js";

export const DEVELOPMENT_EVALUATOR_REQUEST_SCHEMA_ID =
  `${SCHEMA_BASE_URL}development-evaluator-request.schema.json`;
export const DEVELOPMENT_EVALUATOR_RESULT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}development-evaluator-result.schema.json`;

export interface DevelopmentSyntheticTaskPair {
  readonly taskId: string;
  readonly taskInputHash: string;
  readonly parentPassed: boolean;
  readonly candidatePassed: boolean;
}

export interface DevelopmentEvaluatorRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly dryRunRecordHash: string;
  readonly parentHarnessVersionId: string;
  readonly candidateHarnessVersionId: string;
  readonly selectedComponentType:
    DevelopmentMutationDryRunRecord["selectedComponentType"];
  readonly changeSurface: {
    readonly changedComponentCount: 1;
    readonly expandedClosureEditBytes: number;
    readonly structuralEditOperations: number;
    readonly capabilityIdsAdded: readonly [];
    readonly capabilityIdsRemoved: readonly [];
  };
  readonly tasks: readonly DevelopmentSyntheticTaskPair[];
  readonly capabilities: {
    readonly datasetRole: "synthetic_development";
    readonly providerClass: "deterministic_fake";
    readonly toolClass: "immutable_builtin";
    readonly oracleAccess: false;
    readonly gateAccess: false;
    readonly finalAccess: false;
    readonly promotionAccess: false;
    readonly deploymentAccess: false;
  };
  readonly developmentOnly: true;
  readonly promotable: false;
  readonly requestHash: string;
}

export interface DevelopmentEvaluatorResult {
  readonly schemaVersion: 1;
  readonly resultId: string;
  readonly requestHash: string;
  readonly dryRunRecordHash: string;
  readonly candidateHarnessVersionId: string;
  readonly externalProcess: {
    readonly implementationHash: string;
    readonly exitCode: 0;
    readonly stdoutHash: string;
    readonly requestAccepted: true;
  };
  readonly checks: readonly {
    readonly checkId: string;
    readonly passed: true;
  }[];
  readonly syntheticOutcomes: {
    readonly taskCount: number;
    readonly parentPassCount: number;
    readonly candidatePassCount: number;
    readonly passToFailCount: number;
    readonly failToPassCount: number;
    readonly researchMetric: false;
    readonly promotionSignal: false;
  };
  readonly lifecycleBoundary: {
    readonly state: "evaluated_development";
    readonly promotable: false;
    readonly canaryAllowed: false;
    readonly approvedAllowed: false;
    readonly deploymentAllowed: false;
  };
  readonly claimBoundary: DevelopmentClaimBoundary;
  readonly evaluatedAt: string;
  readonly evaluator: PrincipalIdentity;
  readonly resultHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

interface WorkerResponse {
  readonly requestAccepted: true;
  readonly requestHash: string;
  readonly checks: readonly {
    readonly checkId: string;
    readonly passed: true;
  }[];
  readonly syntheticOutcomes:
    DevelopmentEvaluatorResult["syntheticOutcomes"];
}

type RequestCore = Omit<
  DevelopmentEvaluatorRequest,
  "requestHash"
>;
type ResultCore = Omit<
  DevelopmentEvaluatorResult,
  "resultHash" | "publicPrincipal" | "attestation"
>;
type ResultSignedBody = Omit<
  DevelopmentEvaluatorResult,
  "attestation"
>;

const CLAIM_BOUNDARY: DevelopmentClaimBoundary = {
  developmentOnly: true,
  confirmatory: false,
  publicVisibleFixtures: true,
  authorizedForResearchEvidence: false,
  attributionPerformanceClaim: false,
};

function requestCore(
  request: DevelopmentEvaluatorRequest,
): RequestCore {
  const { requestHash: _requestHash, ...core } = request;
  return core;
}

function resultCore(
  result: DevelopmentEvaluatorResult,
): ResultCore {
  const {
    resultHash: _resultHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = result;
  return core;
}

function resultSignedBody(
  result: DevelopmentEvaluatorResult,
): ResultSignedBody {
  const { attestation: _attestation, ...body } = result;
  return body;
}

async function runWorker(input: {
  readonly pythonExecutable: string;
  readonly scriptPath: string;
  readonly request: DevelopmentEvaluatorRequest;
  readonly timeoutMillis: number;
}): Promise<{
  readonly response: WorkerResponse;
  readonly stdoutHash: string;
}> {
  const child = spawn(
    input.pythonExecutable,
    [input.scriptPath],
    {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    },
  );
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBytes += chunk.byteLength;
    if (stdoutBytes <= 1024 * 1024) stdout.push(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderrBytes += chunk.byteLength;
    if (stderrBytes <= 64 * 1024) stderr.push(chunk);
  });
  child.stdin.end(
    `${canonicalize(input.request as unknown as JsonValue)}\n`,
  );
  const result = await new Promise<{
    readonly code: number | null;
    readonly timedOut: boolean;
  }>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, timedOut: true });
    }, input.timeoutMillis);
    timer.unref();
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut: false });
    });
  });
  assertCondition(
    !result.timedOut,
    "DEADLINE_EXCEEDED",
    "Development evaluator subprocess timed out",
  );
  assertCondition(
    result.code === 0 &&
      stdoutBytes <= 1024 * 1024 &&
      stderrBytes === 0,
    "PEER_CRASHED",
    `Development evaluator failed: ${Buffer.concat(stderr).toString("utf8")}`,
  );
  const stdoutBuffer = Buffer.concat(stdout);
  const parsed = parseStrictJson(
    stdoutBuffer.toString("utf8").trimEnd(),
  ) as unknown as WorkerResponse;
  assertCondition(
    stdoutBuffer.toString("utf8") ===
      `${canonicalize(parsed as unknown as JsonValue)}\n`,
    "SCHEMA_INVALID",
    "Development evaluator output is not canonical JSON",
  );
  return {
    response: parsed,
    stdoutHash: `sha256:${sha256Bytes(stdoutBuffer)}`,
  };
}

export class DevelopmentExternalEvaluator {
  readonly #schemas: SchemaRegistry;
  readonly #nonPromotable: NonPromotableHarnessRegistry;
  readonly #evaluator: PrincipalSigner;
  readonly #pythonExecutable: string;
  readonly #scriptPath: string;
  readonly #timeoutMillis: number;

  public constructor(input: {
    readonly schemas: SchemaRegistry;
    readonly nonPromotable: NonPromotableHarnessRegistry;
    readonly evaluator: PrincipalSigner;
    readonly pythonExecutable: string;
    readonly scriptPath: string;
    readonly timeoutMillis?: number;
  }) {
    assertCondition(
      input.evaluator.identity.role === "evaluator",
      "AUTHORIZATION_DENIED",
      "Development external evaluator needs evaluator identity",
    );
    this.#schemas = input.schemas;
    this.#nonPromotable = input.nonPromotable;
    this.#evaluator = input.evaluator;
    this.#pythonExecutable = input.pythonExecutable;
    this.#scriptPath = input.scriptPath;
    this.#timeoutMillis = input.timeoutMillis ?? 5_000;
  }

  public async evaluate(input: {
    readonly requestId: string;
    readonly resultId: string;
    readonly dryRun: DevelopmentMutationDryRunRecord;
    readonly tasks: readonly DevelopmentSyntheticTaskPair[];
    readonly evaluatedAt: string;
  }): Promise<{
    readonly request: DevelopmentEvaluatorRequest;
    readonly result: DevelopmentEvaluatorResult;
  }> {
    assertDevelopmentCandidateDestination(
      input.dryRun,
      "development_external_evaluator",
    );
    const quarantine =
      await this.#nonPromotable.recordFor(
        input.dryRun.candidateHarnessVersionId,
      );
    assertCondition(
      quarantine !== null && quarantine.promotable === false,
      "AUTHORIZATION_DENIED",
      "External dry run requires a non-promotable candidate",
    );
    assertCondition(
      input.tasks.length > 0,
      "SCHEMA_INVALID",
      "Development evaluator needs synthetic tasks",
    );
    const core: RequestCore = {
      schemaVersion: 1,
      requestId: input.requestId,
      dryRunRecordHash: input.dryRun.recordHash,
      parentHarnessVersionId:
        input.dryRun.parentHarnessVersionId,
      candidateHarnessVersionId:
        input.dryRun.candidateHarnessVersionId,
      selectedComponentType:
        input.dryRun.selectedComponentType,
      changeSurface: {
        changedComponentCount: 1,
        expandedClosureEditBytes:
          input.dryRun.change.expandedClosureEditBytes,
        structuralEditOperations:
          input.dryRun.change.structuralEditOperations,
        capabilityIdsAdded: [],
        capabilityIdsRemoved: [],
      },
      tasks: [...input.tasks],
      capabilities: {
        datasetRole: "synthetic_development",
        providerClass: "deterministic_fake",
        toolClass: "immutable_builtin",
        oracleAccess: false,
        gateAccess: false,
        finalAccess: false,
        promotionAccess: false,
        deploymentAccess: false,
      },
      developmentOnly: true,
      promotable: false,
    };
    const request: DevelopmentEvaluatorRequest = {
      ...core,
      requestHash: sha256(core as unknown as JsonValue),
    };
    verifyDevelopmentEvaluatorRequest({
      request,
      dryRun: input.dryRun,
      schemas: this.#schemas,
    });

    const implementationBytes = await readFile(
      this.#scriptPath,
    );
    const implementationHash =
      `sha256:${sha256Bytes(implementationBytes)}`;
    const worker = await runWorker({
      pythonExecutable: this.#pythonExecutable,
      scriptPath: this.#scriptPath,
      request,
      timeoutMillis: this.#timeoutMillis,
    });
    assertCondition(
      worker.response.requestAccepted === true &&
        worker.response.requestHash === request.requestHash,
      "HASH_MISMATCH",
      "Development evaluator response did not bind the request",
    );
    const resultCoreValue: ResultCore = {
      schemaVersion: 1,
      resultId: input.resultId,
      requestHash: request.requestHash,
      dryRunRecordHash: input.dryRun.recordHash,
      candidateHarnessVersionId:
        input.dryRun.candidateHarnessVersionId,
      externalProcess: {
        implementationHash,
        exitCode: 0,
        stdoutHash: worker.stdoutHash,
        requestAccepted: true,
      },
      checks: worker.response.checks,
      syntheticOutcomes:
        worker.response.syntheticOutcomes,
      lifecycleBoundary: {
        state: "evaluated_development",
        promotable: false,
        canaryAllowed: false,
        approvedAllowed: false,
        deploymentAllowed: false,
      },
      claimBoundary: CLAIM_BOUNDARY,
      evaluatedAt: input.evaluatedAt,
      evaluator: this.#evaluator.identity,
    };
    const publicPrincipal = this.#evaluator.exportPublic();
    const body: ResultSignedBody = {
      ...resultCoreValue,
      resultHash: sha256(
        resultCoreValue as unknown as JsonValue,
      ),
      publicPrincipal,
    };
    const result: DevelopmentEvaluatorResult = {
      ...body,
      attestation: this.#evaluator.attest(
        body as unknown as JsonValue,
      ),
    };
    verifyDevelopmentEvaluatorResult({
      result,
      request,
      dryRun: input.dryRun,
      schemas: this.#schemas,
    });
    return { request, result };
  }
}

export function verifyDevelopmentEvaluatorRequest(input: {
  readonly request: DevelopmentEvaluatorRequest;
  readonly dryRun: DevelopmentMutationDryRunRecord;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    DEVELOPMENT_EVALUATOR_REQUEST_SCHEMA_ID,
    input.request as unknown as JsonValue,
  );
  assertCondition(
    input.request.requestHash ===
      sha256(requestCore(input.request) as unknown as JsonValue) &&
      input.request.dryRunRecordHash ===
        input.dryRun.recordHash &&
      input.request.parentHarnessVersionId ===
        input.dryRun.parentHarnessVersionId &&
      input.request.candidateHarnessVersionId ===
        input.dryRun.candidateHarnessVersionId,
    "HASH_MISMATCH",
    "Development evaluator request binding mismatch",
  );
}

export function verifyDevelopmentEvaluatorResult(input: {
  readonly result: DevelopmentEvaluatorResult;
  readonly request: DevelopmentEvaluatorRequest;
  readonly dryRun: DevelopmentMutationDryRunRecord;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    DEVELOPMENT_EVALUATOR_RESULT_SCHEMA_ID,
    input.result as unknown as JsonValue,
  );
  verifyDevelopmentEvaluatorRequest({
    request: input.request,
    dryRun: input.dryRun,
    schemas: input.schemas,
  });
  assertCondition(
    input.result.requestHash === input.request.requestHash &&
      input.result.dryRunRecordHash ===
        input.dryRun.recordHash &&
      input.result.candidateHarnessVersionId ===
        input.dryRun.candidateHarnessVersionId &&
      input.result.lifecycleBoundary.promotable === false,
    "HASH_MISMATCH",
    "Development evaluator result binding mismatch",
  );
  assertCondition(
    input.result.evaluator.role === "evaluator" &&
      canonicalize(input.result.publicPrincipal.identity) ===
        canonicalize(input.result.evaluator),
    "AUTHORIZATION_DENIED",
    "Development evaluator result is not signed by its evaluator",
  );
  assertCondition(
    input.result.resultHash ===
      sha256(resultCore(input.result) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Development evaluator result hash mismatch",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.result.publicPrincipal);
  principals.verify(
    input.result.evaluator,
    resultSignedBody(input.result) as unknown as JsonValue,
    input.result.attestation,
  );
}
