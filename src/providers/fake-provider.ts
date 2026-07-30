import type { ModelProvider, ModelRequest, ModelResponse } from "../domain/model.js";
import { HarnessError } from "../core/errors.js";

export type FakeProviderStep =
  | ModelResponse
  | ((request: ModelRequest, callIndex: number) => ModelResponse | Promise<ModelResponse>);

export class FakeModelProvider implements ModelProvider {
  public readonly providerId = "fake-provider";
  public readonly requests: ModelRequest[] = [];
  readonly #steps: readonly FakeProviderStep[];
  #index = 0;

  public constructor(steps: readonly FakeProviderStep[]) {
    this.#steps = steps;
  }

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    if (request.abortSignal?.aborted === true) {
      throw new HarnessError("DEADLINE_EXCEEDED", "Fake provider request aborted");
    }
    const step = this.#steps[this.#index];
    if (step === undefined) {
      throw new HarnessError("INTERNAL_ERROR", "Fake provider script is exhausted");
    }
    const callIndex = this.#index;
    this.#index += 1;
    this.requests.push(request);
    const response = typeof step === "function" ? await step(request, callIndex) : step;
    if (response.modelIdentity !== request.modelIdentity) {
      throw new HarnessError("PROTOCOL_MISMATCH", "Fake provider model identity mismatch");
    }
    return response;
  }
}
