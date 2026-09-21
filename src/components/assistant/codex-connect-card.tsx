"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePreferredCodexModel } from "@/server/actions/allowed-users";

/**
 * Connecting runs in two phases: the sandbox has to boot (and, the first time,
 * install the codex CLI) before OpenAI hands back a device code. The dialog
 * opens immediately on "preparing" so the click feels answered, then swaps in
 * the code once polling reports it.
 */
type ConnectState =
  | { phase: "preparing" }
  | { phase: "pending"; verificationUrl: string; userCode: string };

export function CodexConnectCard({ initialModel }: { initialModel: string | null }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(true);
  const [connectState, setConnectState] = useState<ConnectState | null>(null);
  const [pending, setPending] = useState(false);
  const [model, setModel] = useState(initialModel ?? "");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function refreshStatus() {
    return fetch("/api/ai/codex/connection")
      .then((res) => res.json())
      .then((data) => {
        setConnected(Boolean(data.connected));
        setConfigured(data.configured !== false);
      });
  }

  useEffect(() => {
    refreshStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function handleConnect() {
    setPending(true);
    try {
      const res = await fetch("/api/ai/codex/connect", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Couldn't start sign-in.");
      }
      setConnectState({ phase: "preparing" });

      pollRef.current = setInterval(async () => {
        const pollRes = await fetch("/api/ai/codex/connect");
        const data = await pollRes.json().catch(() => null);
        if (!pollRes.ok || !data) return;

        if (data.status === "pending" && data.verificationUrl && data.userCode) {
          setConnectState({
            phase: "pending",
            verificationUrl: data.verificationUrl,
            userCode: data.userCode,
          });
        } else if (data.status === "connected") {
          stopPolling();
          setConnectState(null);
          setConnected(true);
          toast.success("Codex subscription connected.");
        } else if (["failed", "expired", "not_found"].includes(data.status)) {
          stopPolling();
          setConnectState(null);
          toast.error(data.message ?? "Sign-in didn't complete. Try again.");
        }
      }, 2000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start sign-in.");
    } finally {
      setPending(false);
    }
  }

  function handleDialogClose() {
    stopPolling();
    setConnectState(null);
  }

  async function handleDisconnect() {
    setPending(true);
    try {
      const res = await fetch("/api/ai/codex/connection", { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't disconnect.");
      setConnected(false);
      toast("Disconnected your Codex subscription.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't disconnect.");
    } finally {
      setPending(false);
    }
  }

  async function handleSaveModel() {
    try {
      await updatePreferredCodexModel(model);
      toast.success("Saved.");
    } catch {
      toast.error("Couldn't save that model.");
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Codex subscription</CardTitle>
          <CardDescription>
            The assistant runs on your own OpenAI/ChatGPT Codex subscription — nobody
            else&apos;s usage is billed for your questions, and vice versa.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <span
            className="inline-flex size-2 rounded-full"
            style={{ background: connected ? "var(--brand-green-foreground)" : "var(--muted-foreground)" }}
          />
          <span className="text-sm text-foreground">
            {!configured
              ? "Not available on this deployment"
              : connected === null
                ? "Checking…"
                : connected
                  ? "Connected"
                  : "Not connected"}
          </span>
        </CardContent>
        <CardFooter className="flex-col items-start gap-2">
          {connected ? (
            <Button variant="outline" onClick={handleDisconnect} disabled={pending}>
              Disconnect
            </Button>
          ) : (
            <Button onClick={handleConnect} disabled={pending || !configured}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Connect your Codex subscription
            </Button>
          )}
          {!configured ? (
            <p className="text-xs text-muted-foreground">
              The assistant runs your Codex subscription in a Vercel Sandbox, which needs the
              deployment&apos;s OIDC token. Locally, run <code>vercel env pull</code> once.
            </p>
          ) : null}
        </CardFooter>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Preferred model</CardTitle>
          <CardDescription>
            Optional. Type a Codex model id your subscription supports (e.g. gpt-5-codex). Leave
            blank to use the default.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="preferred-model" className="sr-only">
              Preferred model
            </Label>
            <Input
              id="preferred-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-5-codex"
            />
          </div>
          <Button variant="outline" onClick={handleSaveModel}>
            Save
          </Button>
        </CardContent>
      </Card>

      <Dialog open={connectState !== null} onOpenChange={(open) => !open && handleDialogClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in to ChatGPT</DialogTitle>
            <DialogDescription>
              {connectState?.phase === "pending"
                ? "Open the link below and enter the code to connect your subscription."
                : "Starting your private sandbox — this takes a few seconds the first time."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {connectState?.phase === "pending" ? (
              <>
                <a
                  href={connectState.verificationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-primary underline underline-offset-4"
                >
                  {connectState.verificationUrl}
                </a>
                <CodeChip code={connectState.userCode} />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Waiting for sign-in…
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Preparing…
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={copy}
      className="flex items-center gap-3 rounded-xl border bg-secondary px-5 py-3 font-mono text-xl tracking-widest text-secondary-foreground transition hover:opacity-90"
    >
      {code}
      {copied ? <Check className="size-4" /> : <Copy className="size-4 opacity-60" />}
    </button>
  );
}
