import "server-only";

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { nanoid } from "nanoid";

import { AppServerClient, startAppServer } from "@/lib/codex/app-server-client";
import { codexHomeFor, hasPersistedAuth } from "@/lib/codex/home";

export class ReauthenticationRequiredError extends Error {
  constructor() {
    super("Codex subscription needs to be reconnected.");
  }
}

type LoginStatus = "pending" | "connected" | "failed" | "expired";

type PendingLogin = {
  userId: string;
  client: AppServerClient;
  status: LoginStatus;
  message?: string;
  verificationUrl: string;
  userCode: string;
  expiresAt: number;
  timeout: ReturnType<typeof setTimeout>;
  unsubscribe: () => void;
};

const LOGIN_TTL_MS = 10 * 60 * 1000;
const INVOCATION_TIMEOUT_MS = 90 * 1000;

function codexCommand() {
  return process.env.CODEX_APP_SERVER_COMMAND?.trim() || "codex";
}

// Fast Refresh reloads this module often in dev; stash the map on globalThis
// so an in-flight login's child process isn't orphaned by losing its
// reference. A full `next dev` restart still kills it — the child process's
// parent is gone either way, and that's an accepted dev-mode limitation.
const globalForCodex = globalThis as unknown as { __codexPendingLogins?: Map<string, PendingLogin> };
const pendingLogins = globalForCodex.__codexPendingLogins ?? new Map<string, PendingLogin>();
if (process.env.NODE_ENV !== "production") globalForCodex.__codexPendingLogins = pendingLogins;

export type DeviceLogin = { loginId: string; verificationUrl: string; userCode: string; expiresAt: number };

export async function startLogin(userId: string): Promise<DeviceLogin> {
  const codeHome = codexHomeFor(userId);
  const client = await startAppServer(codexCommand(), codeHome);

  let result: { verificationUrl?: string; userCode?: string };
  try {
    result = await client.call("account/login/start", { type: "chatgptDeviceCode" });
  } catch (error) {
    client.close();
    throw error;
  }

  if (!result.verificationUrl || !result.userCode) {
    client.close();
    throw new Error("Codex app-server did not return a device code.");
  }

  const loginId = `codex_login_${nanoid()}`;
  const expiresAt = Date.now() + LOGIN_TTL_MS;

  const unsubscribe = client.onNotification((event) => {
    const pending = pendingLogins.get(loginId);
    if (!pending) return;
    if (event.method === "account/login/completed") {
      const params = event.params as { success?: boolean; error?: { message?: string } } | undefined;
      pending.status = params?.error ? "failed" : "connected";
      pending.message = params?.error?.message;
    } else if (event.method === "account/login/failed") {
      pending.status = "failed";
    }
  });

  const timeout = setTimeout(() => {
    const pending = pendingLogins.get(loginId);
    if (pending && pending.status === "pending") {
      pending.status = "expired";
      pending.unsubscribe();
      pending.client.close();
      pendingLogins.delete(loginId);
    }
  }, LOGIN_TTL_MS);

  pendingLogins.set(loginId, {
    userId,
    client,
    status: "pending",
    verificationUrl: result.verificationUrl,
    userCode: result.userCode,
    expiresAt,
    timeout,
    unsubscribe,
  });

  return { loginId, verificationUrl: result.verificationUrl, userCode: result.userCode, expiresAt };
}

export type LoginPollResult = { status: LoginStatus | "not_found"; message?: string };

export async function pollLogin(loginId: string): Promise<LoginPollResult> {
  const pending = pendingLogins.get(loginId);
  if (!pending) return { status: "not_found" };

  if (pending.status === "connected") {
    const codeHome = codexHomeFor(pending.userId);
    // The completion notification can arrive a beat before Codex finishes
    // writing auth.json; give it a brief moment before trusting "connected".
    for (let attempt = 0; attempt < 20 && !hasPersistedAuth(codeHome); attempt++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!hasPersistedAuth(codeHome)) {
      pending.status = "failed";
      pending.message = "Sign-in completed, but the credential wasn't saved. Start a new connection.";
    }
  }

  if (pending.status === "connected" || pending.status === "failed" || pending.status === "expired") {
    clearTimeout(pending.timeout);
    pending.unsubscribe();
    pending.client.close();
    pendingLogins.delete(loginId);
  }

  return { status: pending.status, message: pending.message };
}

export async function disconnect(userId: string): Promise<void> {
  const codeHome = codexHomeFor(userId);
  if (!hasPersistedAuth(codeHome)) return;
  const client = await startAppServer(codexCommand(), codeHome);
  try {
    await client.call("account/logout", {});
  } finally {
    client.close();
  }
}

export function isConnected(userId: string): boolean {
  return hasPersistedAuth(codexHomeFor(userId));
}

export type CodexChatMessage = { role: "user" | "assistant" | "system"; content: string };

function renderPrompt(messages: CodexChatMessage[]): string {
  return messages
    .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
    .join("\n\n");
}

const BASE_INSTRUCTIONS =
  "You are the assistant inside Aquatiq's IT Priorities board. Answer the supplied conversation directly, using the board context you're given when relevant. Do not use tools, access files, run commands, or modify anything. Return only the answer.";

export async function invoke({
  userId,
  model,
  messages,
  effort,
  boardContext,
  onDelta,
  signal,
}: {
  userId: string;
  model: string;
  messages: CodexChatMessage[];
  effort?: "low" | "high";
  boardContext?: string;
  onDelta: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const codeHome = codexHomeFor(userId);
  if (!hasPersistedAuth(codeHome)) throw new ReauthenticationRequiredError();

  const client = await startAppServer(codexCommand(), codeHome);
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "it-priorities-codex-"));

  const cleanup = () => {
    client.close();
    fs.rm(workspace, { recursive: true, force: true }, () => {});
  };

  const onAbort = () => cleanup();
  signal?.addEventListener("abort", onAbort, { once: true });

  const hardTimeout = setTimeout(cleanup, INVOCATION_TIMEOUT_MS);

  try {
    const thread = await client.call<{ thread: { id: string } }>("thread/start", {
      cwd: workspace,
      model,
      approvalPolicy: "never",
      sandbox: "read-only",
      serviceName: "it_priorities",
      baseInstructions: boardContext ? `${BASE_INSTRUCTIONS}\n\n${boardContext}` : BASE_INSTRUCTIONS,
      ephemeral: true,
    });
    const threadId = thread.thread.id;

    await new Promise<void>((resolve, reject) => {
      const unsubscribe = client.onNotification((event) => {
        const params = event.params as {
          threadId?: string;
          delta?: string;
          item?: { type?: string; text?: string };
          turn?: { status?: string };
        };
        if (params?.threadId && params.threadId !== threadId) return;

        switch (event.method) {
          case "item/agentMessage/delta":
            if (params.delta) onDelta(params.delta);
            break;
          case "item/completed":
            if (params.item?.type === "agentMessage" && params.item.text) onDelta(params.item.text);
            break;
          case "turn/completed":
            unsubscribe();
            if (params.turn?.status && params.turn.status !== "completed") {
              reject(new Error(`Codex turn ended with status ${params.turn.status}`));
            } else {
              resolve();
            }
            break;
          case "turn/failed":
            unsubscribe();
            reject(new Error("Codex turn failed."));
            break;
        }
      });

      client
        .call("turn/start", {
          threadId,
          effort: effort ?? "low",
          input: [{ type: "text", text: renderPrompt(messages) }],
        })
        .catch((error) => {
          unsubscribe();
          reject(error);
        });
    });
  } finally {
    clearTimeout(hardTimeout);
    signal?.removeEventListener("abort", onAbort);
    cleanup();
  }
}
