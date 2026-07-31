import http from "node:http";
import net from "node:net";
import tls from "node:tls";

import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses.js";

import {
  parseStrictJson,
  type JsonValue,
} from "../core/canonical.js";
import {
  HarnessError,
  assertCondition,
} from "../core/errors.js";
import {
  OpenAIResponsesProvider,
  type OpenAIResponsesProviderOptions,
} from "./openai-responses-provider.js";

interface OpenAIConnectTransportOptions {
  readonly egressSocketPath: string;
  readonly allowedHost: "api.openai.com";
  readonly allowedPort: 443;
  readonly tlsServerName: "api.openai.com";
  readonly apiPath: "/v1/responses";
  readonly apiKey: string;
  readonly timeoutMillis: number;
  readonly maxRequestBytes: number;
  readonly maxResponseBytes: number;
}

async function waitForConnect(
  socket: net.Socket,
  abortSignal: AbortSignal | undefined,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      socket.removeListener("connect", onConnect);
      socket.removeListener("error", onError);
      abortSignal?.removeEventListener("abort", onAbort);
    };
    const onConnect = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onAbort = (): void => {
      cleanup();
      socket.destroy();
      reject(
        new HarnessError(
          "DEADLINE_EXCEEDED",
          "OpenAI CONNECT request was cancelled",
        ),
      );
    };
    socket.once("connect", onConnect);
    socket.once("error", onError);
    abortSignal?.addEventListener("abort", onAbort, {
      once: true,
    });
  });
}

async function admitTunnel(input: {
  readonly socket: net.Socket;
  readonly target: string;
  readonly abortSignal: AbortSignal | undefined;
}): Promise<void> {
  const request = Buffer.from(
    `CONNECT ${input.target} HTTP/1.1\r\nHost: ${input.target}\r\nConnection: keep-alive\r\n\r\n`,
    "ascii",
  );
  input.socket.write(request);
  await new Promise<void>((resolve, reject) => {
    let response = Buffer.alloc(0);
    const cleanup = (): void => {
      input.socket.removeListener("data", onData);
      input.socket.removeListener("error", onError);
      input.abortSignal?.removeEventListener(
        "abort",
        onAbort,
      );
    };
    const onData = (chunk: Buffer): void => {
      response = Buffer.concat([response, chunk]);
      if (response.byteLength > 4096) {
        cleanup();
        reject(
          new HarnessError(
            "PAYLOAD_TOO_LARGE",
            "CONNECT response header is too large",
          ),
        );
        return;
      }
      const end = response.indexOf("\r\n\r\n");
      if (end < 0) return;
      cleanup();
      assertCondition(
        end + 4 === response.byteLength &&
          response
            .subarray(0, end)
            .toString("ascii")
            .startsWith("HTTP/1.1 200 "),
        "AUTHENTICATION_FAILED",
        "CONNECT broker denied or polluted the tunnel",
      );
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onAbort = (): void => {
      cleanup();
      input.socket.destroy();
      reject(
        new HarnessError(
          "DEADLINE_EXCEEDED",
          "OpenAI CONNECT admission was cancelled",
        ),
      );
    };
    input.socket.on("data", onData);
    input.socket.once("error", onError);
    input.abortSignal?.addEventListener("abort", onAbort, {
      once: true,
    });
  });
}

async function secureTunnel(
  options: OpenAIConnectTransportOptions,
  abortSignal: AbortSignal | undefined,
): Promise<tls.TLSSocket> {
  const socket = net.createConnection({
    path: options.egressSocketPath,
  });
  socket.setTimeout(options.timeoutMillis, () =>
    socket.destroy(
      new HarnessError(
        "DEADLINE_EXCEEDED",
        "CONNECT broker timed out",
      ),
    ),
  );
  await waitForConnect(socket, abortSignal);
  await admitTunnel({
    socket,
    target: `${options.allowedHost}:${options.allowedPort}`,
    abortSignal,
  });
  const secure = tls.connect({
    socket,
    servername: options.tlsServerName,
    ALPNProtocols: ["http/1.1"],
    minVersion: "TLSv1.2",
    rejectUnauthorized: true,
  });
  secure.setTimeout(options.timeoutMillis, () =>
    secure.destroy(
      new HarnessError(
        "DEADLINE_EXCEEDED",
        "OpenAI TLS tunnel timed out",
      ),
    ),
  );
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      secure.removeListener("secureConnect", onConnect);
      secure.removeListener("error", onError);
      abortSignal?.removeEventListener("abort", onAbort);
    };
    const onConnect = (): void => {
      cleanup();
      assertCondition(
        secure.alpnProtocol === "http/1.1" ||
          secure.alpnProtocol === false,
        "AUTHENTICATION_FAILED",
        "OpenAI tunnel negotiated an unsupported protocol",
      );
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onAbort = (): void => {
      cleanup();
      secure.destroy();
      reject(
        new HarnessError(
          "DEADLINE_EXCEEDED",
          "OpenAI TLS handshake was cancelled",
        ),
      );
    };
    secure.once("secureConnect", onConnect);
    secure.once("error", onError);
    abortSignal?.addEventListener("abort", onAbort, {
      once: true,
    });
  });
  return secure;
}

class OpenAIConnectTransport {
  readonly #options: OpenAIConnectTransportOptions;

  public constructor(options: OpenAIConnectTransportOptions) {
    this.#options = options;
  }

  public async create(
    params: ResponseCreateParamsNonStreaming,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<Response> {
    const body = Buffer.from(JSON.stringify(params), "utf8");
    assertCondition(
      body.byteLength <= this.#options.maxRequestBytes,
      "PAYLOAD_TOO_LARGE",
      "OpenAI API request exceeds the frozen byte cap",
    );
    const secure = await secureTunnel(
      this.#options,
      options.signal,
    );
    const agent = new http.Agent({ keepAlive: false });
    agent.createConnection = ((
      _connectionOptions: net.NetConnectOpts,
      callback: (
        error: Error | null,
        socket?: net.Socket,
      ) => void,
    ): net.Socket => {
      callback(null, secure);
      return secure;
    }) as typeof agent.createConnection;
    try {
      const responseBody = await new Promise<Buffer>(
        (resolve, reject) => {
          const request = http.request(
            {
              method: "POST",
              host: this.#options.allowedHost,
              port: this.#options.allowedPort,
              path: this.#options.apiPath,
              agent,
              headers: {
                Host: this.#options.allowedHost,
                Authorization: `Bearer ${this.#options.apiKey}`,
                "Content-Type": "application/json",
                "Content-Length": String(body.byteLength),
                Connection: "close",
                "User-Agent":
                  "self-evolving-harness-provider-proxy/0.1",
              },
            },
            (response) => {
              const chunks: Buffer[] = [];
              let size = 0;
              response.on("data", (chunk: Buffer) => {
                size += chunk.byteLength;
                if (size > this.#options.maxResponseBytes) {
                  request.destroy(
                    new HarnessError(
                      "PAYLOAD_TOO_LARGE",
                      "OpenAI response exceeds the frozen byte cap",
                    ),
                  );
                  return;
                }
                chunks.push(Buffer.from(chunk));
              });
              response.once("end", () => {
                if (
                  response.statusCode === undefined ||
                  response.statusCode < 200 ||
                  response.statusCode >= 300
                ) {
                  reject(
                    new HarnessError(
                      "INTERNAL_ERROR",
                      `OpenAI returned HTTP ${response.statusCode ?? 0}`,
                    ),
                  );
                  return;
                }
                resolve(Buffer.concat(chunks));
              });
            },
          );
          const onAbort = (): void => {
            request.destroy(
              new HarnessError(
                "DEADLINE_EXCEEDED",
                "OpenAI response request was cancelled",
              ),
            );
          };
          options.signal?.addEventListener("abort", onAbort, {
            once: true,
          });
          request.once("error", reject);
          request.once("close", () =>
            options.signal?.removeEventListener(
              "abort",
              onAbort,
            ),
          );
          request.end(body);
        },
      );
      const parsed = parseStrictJson(
        responseBody.toString("utf8"),
      );
      assertCondition(
        typeof parsed === "object" &&
          parsed !== null &&
          !Array.isArray(parsed),
        "SCHEMA_INVALID",
        "OpenAI response is not a JSON object",
      );
      return parsed as unknown as Response;
    } finally {
      agent.destroy();
      secure.destroy();
    }
  }
}

export function createOpenAIProviderViaConnect(input: {
  readonly apiKey: string;
  readonly providerOptions: OpenAIResponsesProviderOptions;
  readonly transport: Omit<
    OpenAIConnectTransportOptions,
    "apiKey"
  >;
}): OpenAIResponsesProvider {
  assertCondition(
    input.apiKey.length > 0,
    "AUTHENTICATION_FAILED",
    "OpenAI API key is empty",
  );
  const transport = new OpenAIConnectTransport({
    ...input.transport,
    apiKey: input.apiKey,
  });
  const client = {
    responses: {
      create: (
        params: ResponseCreateParamsNonStreaming,
        options?: { readonly signal?: AbortSignal },
      ) => transport.create(params, options),
    },
  } as unknown as ConstructorParameters<
    typeof OpenAIResponsesProvider
  >[0];
  return new OpenAIResponsesProvider(
    client,
    input.providerOptions,
  );
}
