#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const EXPECTED_TARGET = "4BA3B4F29D8FD1597A712A46C80CB67E";
const EXPECTED_URL =
  "https://chatgpt.com/c/6a6b1847-22c8-83e8-9558-8297a43979e0";
const ENDPOINT = "127.0.0.1:9222";

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.socket = null;
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id !== "number") return;
      const pending = this.pending.get(message.id);
      if (pending === undefined) return;
      this.pending.delete(message.id);
      if (message.error !== undefined) {
        pending.reject(new Error(JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result);
      }
    });
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener(
        "error",
        () => reject(new Error("CDP WebSocket connection failed")),
        { once: true },
      );
    });
  }

  async send(method, params = {}) {
    if (this.socket === null) throw new Error("CDP client is not connected");
    const id = this.nextId++;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 10_000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails !== undefined) {
      throw new Error(
        `page evaluation failed: ${JSON.stringify(result.exceptionDetails)}`,
      );
    }
    return result.result.value;
  }

  close() {
    this.socket?.close();
  }
}

const stateExpression = `(() => {
  const composer =
    document.querySelector("#prompt-textarea") ??
    document.querySelector('[contenteditable="true"][data-virtualkeyboard="true"]') ??
    document.querySelector('[contenteditable="true"]');
  const text = composer === null
    ? null
    : ("value" in composer ? composer.value : composer.innerText);
  const messages = [...document.querySelectorAll("[data-message-author-role]")];
  const userMessages = messages.filter(
    (element) => element.getAttribute("data-message-author-role") === "user",
  );
  const assistantMessages = messages.filter(
    (element) => element.getAttribute("data-message-author-role") === "assistant",
  );
  const latestAssistant = assistantMessages.at(-1)?.innerText ?? "";
  const buttons = [...document.querySelectorAll("button")];
  const stopButton = buttons.find((button) =>
    button.dataset.testid === "stop-button" ||
    /stop generating|stop streaming|중지/i.test(
      (button.getAttribute("aria-label") ?? "") + " " + button.innerText,
    ),
  );
  const sendButton =
    document.querySelector('button[data-testid="send-button"]') ??
    buttons.find((button) =>
      /send prompt|send message|보내기/i.test(
        (button.getAttribute("aria-label") ?? "") + " " + button.innerText,
      ),
    );
  return {
    url: location.href,
    title: document.title,
    composerCount: document.querySelectorAll(
      '#prompt-textarea, [contenteditable="true"]',
    ).length,
    composerText: text,
    composerTextLength: text === null ? null : text.length,
    sendButtonPresent: sendButton !== null && sendButton !== undefined,
    sendButtonDisabled:
      sendButton === null || sendButton === undefined
        ? null
        : Boolean(sendButton.disabled),
    stopButtonPresent: stopButton !== undefined,
    userCount: userMessages.length,
    assistantCount: assistantMessages.length,
    latestAssistantLength: latestAssistant.length,
    latestAssistantPrefix: latestAssistant.slice(0, 160),
    buttonTestIds: buttons
      .map((button) => button.dataset.testid)
      .filter((value) => value !== undefined)
      .slice(0, 30),
  };
})()`;

async function pageState(client) {
  const state = await client.evaluate(stateExpression);
  if (state.url !== EXPECTED_URL) {
    throw new Error(`target navigated away from expected URL: ${state.url}`);
  }
  return state;
}

async function target() {
  const response = await fetch(`http://${ENDPOINT}/json/list`);
  if (!response.ok) {
    throw new Error(`CDP target list failed: ${response.status}`);
  }
  const targets = await response.json();
  const selected = targets.find((item) => item.id === EXPECTED_TARGET);
  if (selected === undefined) {
    throw new Error(`expected CDP target is missing: ${EXPECTED_TARGET}`);
  }
  if (
    selected.type !== "page" ||
    selected.url !== EXPECTED_URL ||
    typeof selected.webSocketDebuggerUrl !== "string"
  ) {
    throw new Error(
      `expected target identity mismatch: ${JSON.stringify({
        id: selected.id,
        type: selected.type,
        url: selected.url,
      })}`,
    );
  }
  return selected;
}

async function inspect(client) {
  console.log(JSON.stringify(await pageState(client), null, 2));
}

async function digestLatest(client) {
  const result = await client.evaluate(`(async () => {
    const messages = [...document.querySelectorAll(
      '[data-message-author-role="assistant"]',
    )];
    const text = (messages.at(-1)?.innerText ?? "") + "\\n";
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return {
      characterCount: text.length,
      byteCount: bytes.byteLength,
      sha256: [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
    };
  })()`);
  console.log(JSON.stringify(result, null, 2));
}

async function submit(client, packetPath) {
  const before = await pageState(client);
  if (
    before.stopButtonPresent ||
    typeof before.composerText !== "string" ||
    before.composerText.trim() !== ""
  ) {
    throw new Error(
      `composer is not idle and empty: ${JSON.stringify(before)}`,
    );
  }
  const packet = await readFile(packetPath, "utf8");
  const prompt = [
    "Continue the same self-evolving-harness architect review.",
    "Treat the following architect packet as the sole new evidence.",
    "Do not invent facts outside it. Return the packet's required decision format.",
    "",
    packet,
  ].join("\n");
  const focused = await client.evaluate(`(() => {
    const composer =
      document.querySelector("#prompt-textarea") ??
      document.querySelector('[contenteditable="true"][data-virtualkeyboard="true"]') ??
      document.querySelector('[contenteditable="true"]');
    if (composer === null) return false;
    composer.focus();
    return document.activeElement === composer || composer.contains(document.activeElement);
  })()`);
  if (!focused) throw new Error("could not focus the ChatGPT composer");
  await client.send("Input.insertText", { text: prompt });
  const filled = await pageState(client);
  if (
    filled.composerTextLength === null ||
    filled.composerTextLength < packet.length
  ) {
    throw new Error(
      `composer did not receive the complete packet: ${JSON.stringify(filled)}`,
    );
  }
  const clicked = await client.evaluate(`(() => {
    const buttons = [...document.querySelectorAll("button")];
    const send =
      document.querySelector('button[data-testid="send-button"]') ??
      buttons.find((button) =>
        /send prompt|send message|보내기/i.test(
          (button.getAttribute("aria-label") ?? "") + " " + button.innerText,
        ),
      );
    if (send === null || send === undefined || send.disabled) return false;
    send.click();
    return true;
  })()`);
  if (!clicked) throw new Error("send button was unavailable after filling");
  const deadline = Date.now() + 15_000;
  let after = await pageState(client);
  while (Date.now() < deadline && after.userCount !== before.userCount + 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    after = await pageState(client);
  }
  if (after.userCount !== before.userCount + 1) {
    throw new Error(
      `submission was not observed exactly once: ${JSON.stringify({
        before,
        after,
      })}`,
    );
  }
  console.log(
    JSON.stringify(
      {
        submitted: true,
        target: EXPECTED_TARGET,
        url: EXPECTED_URL,
        packetCharacters: packet.length,
        promptCharacters: prompt.length,
        userCountBefore: before.userCount,
        userCountAfter: after.userCount,
        assistantCountBefore: before.assistantCount,
        assistantCountAfter: after.assistantCount,
      },
      null,
      2,
    ),
  );
}

async function sendExisting(client, expectedUserCount) {
  const before = await pageState(client);
  if (
    before.userCount !== expectedUserCount ||
    before.stopButtonPresent ||
    typeof before.composerText !== "string" ||
    before.composerTextLength === null ||
    before.composerTextLength < 12_000 ||
    !before.sendButtonPresent ||
    before.sendButtonDisabled
  ) {
    throw new Error(
      `existing composer is not safe to submit: ${JSON.stringify(before)}`,
    );
  }
  const clicked = await client.evaluate(`(() => {
    const send = document.querySelector('button[data-testid="send-button"]');
    if (send === null || send.disabled) return false;
    send.click();
    return true;
  })()`);
  if (!clicked) throw new Error("send button could not be clicked");
  const deadline = Date.now() + 15_000;
  let after = await pageState(client);
  while (Date.now() < deadline && after.userCount !== before.userCount + 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    after = await pageState(client);
  }
  if (after.userCount !== before.userCount + 1) {
    throw new Error(
      `existing composer submission was not observed exactly once: ${JSON.stringify({
        before,
        after,
      })}`,
    );
  }
  console.log(
    JSON.stringify(
      {
        submitted: true,
        recoveredAfterInsertTimeout: true,
        target: EXPECTED_TARGET,
        url: EXPECTED_URL,
        userCountBefore: before.userCount,
        userCountAfter: after.userCount,
        assistantCountBefore: before.assistantCount,
        assistantCountAfter: after.assistantCount,
      },
      null,
      2,
    ),
  );
}

async function harvest(client, baselineResponsePath) {
  const baselineResponse = (
    await readFile(baselineResponsePath, "utf8")
  ).trimEnd();
  const deadline = Date.now() + 45 * 60_000;
  let stableText = "";
  let stableSince = 0;
  let lastProgressAt = 0;
  while (Date.now() < deadline) {
    const state = await pageState(client);
    const assistantTexts = await client.evaluate(`(() => {
      const messages = [...document.querySelectorAll(
        '[data-message-author-role="assistant"]',
      )];
      return messages.map((message) => message.innerText ?? "");
    })()`);
    const fullText = assistantTexts.at(-1) ?? "";
    if (fullText !== stableText) {
      stableText = fullText;
      stableSince = Date.now();
    }
    if (
      fullText.trim() !== "" &&
      fullText !== baselineResponse &&
      !state.stopButtonPresent &&
      Date.now() - stableSince >= 12_000
    ) {
      console.log(
        JSON.stringify({
          complete: true,
          target: EXPECTED_TARGET,
          url: EXPECTED_URL,
          userCount: state.userCount,
          assistantCount: state.assistantCount,
          responseCharacters: fullText.length,
        }),
      );
      console.log("SEH_ARCHITECT_RESPONSE_BEGIN");
      console.log(fullText);
      console.log("SEH_ARCHITECT_RESPONSE_END");
      return;
    }
    if (Date.now() - lastProgressAt >= 5_000) {
      console.error(
        JSON.stringify({
          waiting: true,
          userCount: state.userCount,
          assistantCount: state.assistantCount,
          responseCharacters: fullText.length,
          stopButtonPresent: state.stopButtonPresent,
        }),
      );
      lastProgressAt = Date.now();
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("architect response did not stabilize before the deadline");
}

async function main() {
  const mode = process.argv[2];
  const selected = await target();
  const client = new CdpClient(selected.webSocketDebuggerUrl);
  await client.connect();
  try {
    await client.send("Runtime.enable");
    if (mode === "inspect") {
      await inspect(client);
    } else if (mode === "digest-latest") {
      await digestLatest(client);
    } else if (mode === "submit") {
      const packetPath = process.argv[3];
      if (packetPath === undefined) throw new Error("packet path is required");
      await submit(client, packetPath);
    } else if (mode === "send-existing") {
      const expectedUserCount = Number(process.argv[3]);
      if (!Number.isSafeInteger(expectedUserCount)) {
        throw new Error("send-existing requires the expected user count");
      }
      await sendExisting(client, expectedUserCount);
    } else if (mode === "harvest") {
      const baselineResponsePath = process.argv[3];
      if (baselineResponsePath === undefined) {
        throw new Error("harvest requires the prior response path");
      }
      await harvest(client, baselineResponsePath);
    } else {
      throw new Error(
        "mode must be inspect, digest-latest, submit, send-existing, or harvest",
      );
    }
  } finally {
    client.close();
  }
}

await main();
