import "server-only";
import { Sandbox } from "@vercel/sandbox";
import { DRIVER_SOURCE } from "./driver";

/**
 * Runs each user's Codex subscription inside their own Vercel Sandbox.
 *
 * Connecting a Codex subscription needs three things serverless functions do
 * not have: a subprocess, a filesystem that survives between requests, and
 * login state that outlives a single HTTP request. A per-user persistent
 * sandbox supplies all three — it snapshots its filesystem when it stops and
 * restores it on resume, so the user's CODEX_HOME (and the auth.json inside it)
 * persists exactly as it did on the old companion service, while the app itself
 * stays fully serverless.
 *
 * No OAuth token ever reaches this app or its database: the credential is
 * written by the codex CLI into the sandbox and never read out of it.
 */

export class CodexNotConfiguredError extends Error {
  constructor() {
    super(
      "The assistant isn't available on this deployment — it needs Vercel Sandbox access (an OIDC token or VERCEL_TOKEN)."
    );
    this.name = "CodexNotConfiguredError";
  }
}

export class CodexNotConnectedError extends Error {
  constructor() {
    super("Connect your Codex subscription in Settings → Assistant first.");
    this.name = "CodexNotConnectedError";
  }
}

const SANDBOX_ROOT = "/vercel/sandbox";
const CODEX_HOME = `${SANDBOX_ROOT}/.codex`;
const DRIVER_PATH = `${SANDBOX_ROOT}/codex-driver.mjs`;
const STATUS_PATH = `${CODEX_HOME}/login-status.json`;
const AUTH_PATH = `${CODEX_HOME}/auth.json`;
const TURN_PATH = `${SANDBOX_ROOT}/turn.json`;

/** Long enough to cover the 10-minute device-code TTL with room to spare. */
const LOGIN_SESSION_MS = 15 * 60 * 1000;
/** Kept warm between turns of a conversation, then allowed to lapse. */
const CHAT_SESSION_MS = 10 * 60 * 1000;

const BASE_INSTRUCTIONS =
  "You are the assistant inside Aquatiq's IT Priorities board. Answer the supplied conversation directly, using the board context you're given when relevant. Do not use tools, access files, run commands, or modify anything. Return only the answer.";

export function isCodexConfigured() {
  return Boolean(process.env.VERCEL_OIDC_TOKEN?.trim() || process.env.VERCEL_TOKEN?.trim());
}

function sandboxNameFor(userId: string) {
  // The id comes from our own database, but it is interpolated into a resource
  // name, so it is validated rather than trusted.
  if (!/^[a-z0-9]{1,48}$/i.test(userId)) throw new Error("Invalid user id.");
  return `codex-${userId.toLowerCase()}`;
}

/** Installs the codex CLI if the snapshot doesn't already carry it, and syncs the driver. */
async function ensureReady(sandbox: Sandbox) {
  const probe = await sandbox.runCommand("codex", ["--version"]);
  if (probe.exitCode !== 0) {
    const install = await sandbox.runCommand({
      cmd: "npm",
      args: ["install", "-g", "@openai/codex"],
      sudo: true,
    });
    if (install.exitCode !== 0) {
      const detail = (await install.stderr()).trim().slice(-400);
      throw new Error(`Couldn't install the codex CLI in the sandbox. ${detail}`);
    }
  }
  // mkdir -p rather than sandbox.mkDir: the SDK helper resolves paths against
  // the working directory and rejects this absolute one.
  await sandbox.runCommand("mkdir", ["-p", CODEX_HOME]);
  // Rewritten every time so the driver can never lag behind the deployed code.
  await sandbox.writeFiles([{ path: DRIVER_PATH, content: Buffer.from(DRIVER_SOURCE) }]);
}

async function openSandbox(userId: string, timeout: number) {
  if (!isCodexConfigured()) throw new CodexNotConfiguredError();
  const sandbox = await Sandbox.getOrCreate({
    name: sandboxNameFor(userId),
    timeout,
    resume: true,
    persistent: true,
  });
  await ensureReady(sandbox);
  return sandbox;
}

/** Resumes an existing sandbox without creating one; null when the user has never connected. */
async function findSandbox(userId: string) {
  if (!isCodexConfigured()) throw new CodexNotConfiguredError();
  try {
    return await Sandbox.get({ name: sandboxNameFor(userId), resume: true });
  } catch {
    return null;
  }
}

export type LoginStatus =
  | { status: "preparing" }
  | { status: "pending"; verificationUrl: string; userCode: string; expiresAt: number }
  | { status: "connected" }
  | { status: "failed"; message?: string }
  | { status: "expired" }
  | { status: "not_found" };

/**
 * Starts the device-code login and returns immediately. Preparing the sandbox
 * and fetching a code takes a few seconds, so the code is delivered through
 * getLoginStatus rather than making the caller wait on this request.
 */
export async function startLogin(userId: string): Promise<void> {
  const sandbox = await openSandbox(userId, LOGIN_SESSION_MS);
  // Drop any status left over from a previous attempt so a stale "connected"
  // or "failed" can't be mistaken for this one.
  await sandbox.runCommand("rm", ["-f", STATUS_PATH]);
  await sandbox.runCommand({
    cmd: "node",
    args: [DRIVER_PATH, "login"],
    env: { CODEX_HOME },
    detached: true,
  });
}

export async function getLoginStatus(userId: string): Promise<LoginStatus> {
  const sandbox = await findSandbox(userId);
  if (!sandbox) return { status: "not_found" };

  const buffer = await sandbox.readFileToBuffer({ path: STATUS_PATH });
  if (!buffer) return { status: "preparing" };

  let status: LoginStatus;
  try {
    status = JSON.parse(buffer.toString("utf8")) as LoginStatus;
  } catch {
    return { status: "failed", message: "Couldn't read the sign-in status." };
  }

  if (status.status === "connected") {
    // Stop explicitly so the credential is snapshotted right now, rather than
    // relying on the session timing out later.
    await sandbox.stop().catch(() => {});
  }
  return status;
}

export async function isConnected(userId: string): Promise<boolean> {
  const sandbox = await findSandbox(userId);
  if (!sandbox) return false;
  return (await sandbox.readFileToBuffer({ path: AUTH_PATH })) !== null;
}

export async function disconnect(userId: string): Promise<void> {
  const sandbox = await findSandbox(userId);
  if (!sandbox) return;
  await sandbox.runCommand({
    cmd: "node",
    args: [DRIVER_PATH, "logout"],
    env: { CODEX_HOME },
  });
  // Remove the sandbox entirely: nothing of the user's should linger once they
  // have disconnected.
  await sandbox.delete().catch(() => {});
}

export type CodexChatMessage = { role: "user" | "assistant" | "system"; content: string };
export type CodexStreamEvent =
  | { type: "delta"; text: string }
  | { type: "error"; message: string; code?: string };

function renderPrompt(messages: CodexChatMessage[]) {
  return messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join("\n\n");
}

export async function* inferStream({
  userId,
  model,
  messages,
  effort,
  boardContext,
  signal,
}: {
  userId: string;
  model: string;
  messages: CodexChatMessage[];
  effort?: "low" | "high";
  boardContext?: string;
  signal?: AbortSignal;
}): AsyncGenerator<CodexStreamEvent> {
  const sandbox = await openSandbox(userId, CHAT_SESSION_MS);

  if ((await sandbox.readFileToBuffer({ path: AUTH_PATH })) === null) {
    throw new CodexNotConnectedError();
  }

  // Passed as a file rather than an argument: prompts are long, contain
  // newlines, and are user-supplied.
  await sandbox.writeFiles([
    {
      path: TURN_PATH,
      content: Buffer.from(
        JSON.stringify({
          model,
          effort: effort ?? "low",
          prompt: renderPrompt(messages),
          baseInstructions: boardContext
            ? `${BASE_INSTRUCTIONS}\n\n${boardContext}`
            : BASE_INSTRUCTIONS,
        })
      ),
    },
  ]);

  const command = await sandbox.runCommand({
    cmd: "node",
    args: [DRIVER_PATH, "infer", TURN_PATH],
    env: { CODEX_HOME },
    detached: true,
  });

  let buffer = "";
  try {
    for await (const log of command.logs({ signal })) {
      if (log.stream !== "stdout") continue;
      buffer += log.data;

      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line) as CodexStreamEvent;
        } catch {
          // The driver only ever prints NDJSON on stdout; ignore anything else
          // rather than failing a turn over a stray line.
        }
      }
    }
  } finally {
    if (signal?.aborted) await command.kill("SIGTERM").catch(() => {});
  }
}
