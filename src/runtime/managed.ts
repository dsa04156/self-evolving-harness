import path from "node:path";

import type { AgentRunResult } from "../domain/runtime.js";
import { AuditTrail } from "../evidence/audit-trail.js";
import { EvidenceReceiptStore } from "../evidence/receipts.js";
import {
  OperationsControlPlane,
  type OperationResponse,
} from "../operations/control-plane.js";
import { SessionLifecycleStore } from "../operations/session-lifecycle.js";
import { PrincipalRegistry, type PrincipalSigner } from "../trust/identity.js";
import {
  createStandaloneRuntime,
  type StandaloneRuntime,
  type StandaloneRuntimeOptions,
} from "./standalone.js";

export interface ManagedStandaloneRuntimeOptions
  extends Omit<StandaloneRuntimeOptions, "root" | "parentBudgetAccount"> {
  readonly root: string;
  readonly operationsSigner: PrincipalSigner;
  readonly auditSigner: PrincipalSigner;
}

export interface ManagedExecutionResult {
  readonly start: OperationResponse;
  readonly submit: OperationResponse;
  readonly finalize: OperationResponse | null;
  readonly result: AgentRunResult;
}

/**
 * One owned runtime boundary joining the kernel to durable operations and evidence.
 * It does not call Codex, Gajae-Code, OpenCode, or another agent harness.
 */
export interface ManagedStandaloneRuntime {
  readonly root: string;
  readonly kernel: StandaloneRuntime;
  readonly operations: OperationsControlPlane;
  readonly lifecycle: SessionLifecycleStore;
  readonly receipts: EvidenceReceiptStore;
  readonly audit: AuditTrail;
  execute(task: string): Promise<ManagedExecutionResult>;
  verify(): Promise<void>;
}

export async function createManagedStandaloneRuntime(
  input: ManagedStandaloneRuntimeOptions,
): Promise<ManagedStandaloneRuntime> {
  const root = path.resolve(input.root);
  const principals = new PrincipalRegistry();
  principals.register(input.auditSigner.exportPublic());
  principals.register(input.operationsSigner.exportPublic());
  principals.register(input.runtimeSigner.exportPublic());

  const audit = new AuditTrail({
    root,
    protocolId: input.pins.protocolId,
    signer: input.auditSigner,
    principals,
    clock: input.clock,
    ids: input.ids,
  });
  const receipts = new EvidenceReceiptStore({
    root,
    protocolId: input.pins.protocolId,
    schemas: input.schemas,
    audit,
    principals,
    clock: input.clock,
    ids: input.ids,
  });
  const lifecycle = new SessionLifecycleStore({
    root,
    protocolId: input.pins.protocolId,
    schemas: input.schemas,
    audit,
    receipts,
    principals,
    clock: input.clock,
    ids: input.ids,
  });
  const kernel = await createStandaloneRuntime({
    ...input,
    root: path.join(root, "kernel"),
  });
  const operations = new OperationsControlPlane({
    root,
    protocolId: input.pins.protocolId,
    schemas: input.schemas,
    lifecycle,
    receipts,
    artifacts: kernel.artifacts,
    signer: input.operationsSigner,
    clock: input.clock,
    ids: input.ids,
  });
  await operations.initialize();

  return {
    root,
    kernel,
    operations,
    lifecycle,
    receipts,
    audit,
    async execute(task: string): Promise<ManagedExecutionResult> {
      const start = await operations.start(input.sessionId, input.pins);
      let result: AgentRunResult | null = null;
      const submit = await operations.submit(
        input.sessionId,
        task,
        async (submittedTask, abortSignal) => {
          result = await kernel.run(submittedTask, abortSignal);
          return result;
        },
      );
      const finalized =
        submit.state === "completed"
          ? await operations.finalize(input.sessionId)
          : null;
      if (result === null) {
        throw new Error("Managed execution completed without a kernel result");
      }
      return { start, submit, finalize: finalized, result };
    },
    async verify(): Promise<void> {
      await kernel.events.events();
      await receipts.verifyAll();
      await lifecycle.verifyAll();
      await audit.verifyAll();
    },
  };
}
