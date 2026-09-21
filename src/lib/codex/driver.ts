import "server-only";

/**
 * Source of the script that runs *inside* each user's Vercel Sandbox.
 *
 * It is written into the sandbox verbatim and executed by the sandbox's own
 * Node, so it must stay dependency-free — the only thing installed in there is
 * the codex CLI itself. It lives in a string rather than a file so it is always
 * bundled into the serverless function, with no output-file-tracing config to
 * get wrong.
 *
 * It deliberately contains no backticks, no ${...} and no backslash escapes, so
 * the template literal below needs no escaping and what ships is exactly what
 * runs. Newlines come from NL rather than a "\n" literal for that reason.
 */
export const DRIVER_SOURCE = `
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const NL = String.fromCharCode(10);
const CODEX_HOME = process.env.CODEX_HOME || "/vercel/sandbox/.codex";
const STATUS_FILE = path.join(CODEX_HOME, "login-status.json");
const AUTH_FILE = path.join(CODEX_HOME, "auth.json");
const LOGIN_TTL_MS = 10 * 60 * 1000;
const TURN_TIMEOUT_MS = 4 * 60 * 1000;
const CREDENTIALS_STORE_FLAG = "cli_auth_credentials_store=" + JSON.stringify("file");

function ensureHome() {
  fs.mkdirSync(CODEX_HOME, { recursive: true });
}
function writeStatus(status) {
  ensureHome();
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status));
}
function emit(event) {
  process.stdout.write(JSON.stringify(event) + NL);
}
function hasAuth() {
  return fs.existsSync(AUTH_FILE);
}

class AppServer {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.closed = false;
    this.closeError = null;
    ensureHome();
    const env = Object.assign({}, process.env);
    env.CODEX_HOME = CODEX_HOME;
    this.child = spawn("codex", ["app-server", "-c", CREDENTIALS_STORE_FLAG], { env: env });
    this.child.on("error", (error) => {
      this.closeError = error instanceof Error ? error : new Error(String(error));
      this.closed = true;
      this.failAll(this.closeError);
    });
    this.child.stderr.resume();
    const rl = createInterface({ input: this.child.stdout });
    rl.on("line", (line) => this.handleLine(line));
    this.child.on("close", () => {
      this.closed = true;
      rl.close();
      this.failAll(this.closeError || new Error("codex app-server closed"));
    });
  }

  handleLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let envelope;
    try {
      envelope = JSON.parse(trimmed);
    } catch (parseError) {
      return;
    }
    if (typeof envelope.id === "number") {
      const pending = this.pending.get(envelope.id);
      if (!pending) return;
      this.pending.delete(envelope.id);
      if (envelope.error) pending.reject(new Error(envelope.error.message || "codex app-server error"));
      else pending.resolve(envelope.result);
      return;
    }
    if (envelope.method) {
      for (const listener of this.listeners) listener({ method: envelope.method, params: envelope.params });
    }
  }

  failAll(error) {
    for (const entry of this.pending) entry[1].reject(error);
    this.pending.clear();
  }

  onNotification(listener) {
    this.listeners.add(listener);
    const self = this;
    return function unsubscribe() {
      self.listeners.delete(listener);
    };
  }

  call(method, params, timeoutMs) {
    if (this.closed) return Promise.reject(this.closeError || new Error("codex app-server is closed"));
    const id = this.nextId++;
    const child = this.child;
    const pending = this.pending;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("codex app-server timed out waiting for " + method));
      }, timeoutMs || 30000);
      pending.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id: id, method: method, params: params }) + NL,
        (writeError) => {
          if (writeError) {
            clearTimeout(timer);
            pending.delete(id);
            reject(writeError);
          }
        }
      );
    });
  }

  notify(method, params) {
    if (this.closed) return;
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: method, params: params }) + NL);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.child.kill();
  }
}

async function start() {
  const server = new AppServer();
  await server.call(
    "initialize",
    { clientInfo: { name: "it_priorities", title: "IT Priorities", version: "1" } },
    20000
  );
  server.notify("initialized", {});
  return server;
}

async function commandLogin() {
  writeStatus({ status: "preparing" });
  let server;
  try {
    server = await start();
  } catch (error) {
    writeStatus({ status: "failed", message: (error && error.message) || String(error) });
    return 1;
  }
  try {
    const result = await server.call("account/login/start", { type: "chatgptDeviceCode" }, 60000);
    if (!result || !result.verificationUrl || !result.userCode) {
      throw new Error("Codex did not return a device code.");
    }
    writeStatus({
      status: "pending",
      verificationUrl: result.verificationUrl,
      userCode: result.userCode,
      expiresAt: Date.now() + LOGIN_TTL_MS,
    });

    const outcome = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ status: "expired" }), LOGIN_TTL_MS);
      server.onNotification((event) => {
        const params = event.params || {};
        if (event.method === "account/login/completed") {
          clearTimeout(timer);
          resolve(
            params.error ? { status: "failed", message: params.error.message } : { status: "connected" }
          );
        } else if (event.method === "account/login/failed") {
          clearTimeout(timer);
          resolve({ status: "failed", message: params.error && params.error.message });
        }
      });
    });

    if (outcome.status === "connected") {
      // The completion notification can land a beat before codex finishes
      // writing auth.json; do not report success until it is actually on disk.
      for (let i = 0; i < 50 && !hasAuth(); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!hasAuth()) {
        writeStatus({
          status: "failed",
          message: "Sign-in completed, but the credential was not saved. Start a new connection.",
        });
        return 1;
      }
    }

    writeStatus(outcome);
    return outcome.status === "connected" ? 0 : 1;
  } catch (error) {
    writeStatus({ status: "failed", message: (error && error.message) || String(error) });
    return 1;
  } finally {
    server.close();
  }
}

async function commandLogout() {
  if (hasAuth()) {
    const server = await start();
    try {
      await server.call("account/logout", {}, 30000);
    } finally {
      server.close();
    }
  }
  try {
    fs.rmSync(STATUS_FILE, { force: true });
  } catch (removeError) {}
  try {
    fs.rmSync(AUTH_FILE, { force: true });
  } catch (removeError) {}
  return 0;
}

async function commandInfer(payloadPath) {
  if (!hasAuth()) {
    emit({ type: "error", message: "Your Codex subscription is not connected.", code: "reauth" });
    return 1;
  }
  const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  const server = await start();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "it-priorities-"));
  try {
    const thread = await server.call(
      "thread/start",
      {
        cwd: workspace,
        model: payload.model,
        approvalPolicy: "never",
        sandbox: "read-only",
        serviceName: "it_priorities",
        baseInstructions: payload.baseInstructions,
        ephemeral: true,
      },
      60000
    );
    const threadId = thread.thread.id;
    let sawDelta = false;

    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("The assistant took too long to respond.")),
        TURN_TIMEOUT_MS
      );
      const unsubscribe = server.onNotification((event) => {
        const params = event.params || {};
        if (params.threadId && params.threadId !== threadId) return;
        if (event.method === "item/agentMessage/delta") {
          if (params.delta) {
            sawDelta = true;
            emit({ type: "delta", text: params.delta });
          }
        } else if (event.method === "item/completed") {
          // Fallback only. When deltas streamed, the completed item repeats the
          // same text, and emitting it again would duplicate the whole answer.
          if (!sawDelta && params.item && params.item.type === "agentMessage" && params.item.text) {
            emit({ type: "delta", text: params.item.text });
          }
        } else if (event.method === "turn/completed") {
          clearTimeout(timer);
          unsubscribe();
          if (params.turn && params.turn.status && params.turn.status !== "completed") {
            reject(new Error("Codex turn ended with status " + params.turn.status));
          } else {
            resolve();
          }
        } else if (event.method === "turn/failed") {
          clearTimeout(timer);
          unsubscribe();
          reject(new Error("Codex turn failed."));
        }
      });

      server
        .call(
          "turn/start",
          {
            threadId: threadId,
            effort: payload.effort || "low",
            input: [{ type: "text", text: payload.prompt }],
          },
          TURN_TIMEOUT_MS
        )
        .catch((error) => {
          clearTimeout(timer);
          unsubscribe();
          reject(error);
        });
    });
    return 0;
  } catch (error) {
    emit({ type: "error", message: (error && error.message) || String(error) });
    return 1;
  } finally {
    server.close();
    try {
      fs.rmSync(workspace, { recursive: true, force: true });
    } catch (removeError) {}
  }
}

async function main() {
  const command = process.argv[2];
  if (command === "login") return commandLogin();
  if (command === "logout") return commandLogout();
  if (command === "infer") return commandInfer(process.argv[3]);
  if (command === "status") {
    process.stdout.write(JSON.stringify({ connected: hasAuth() }) + NL);
    return 0;
  }
  process.stderr.write("unknown driver command" + NL);
  return 2;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(String((error && error.stack) || error) + NL);
    process.exit(1);
  });
`;
