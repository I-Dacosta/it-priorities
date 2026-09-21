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

type Login = { loginId: string; verificationUrl: string; userCode: string; expiresAt: number };

export function CodexConnectCard({ initialModel }: { initialModel: string | null }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [login, setLogin] = useState<Login | null>(null);
  const [pending, setPending] = useState(false);
  const [model, setModel] = useState(initialModel ?? "");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function refreshStatus() {
    return fetch("/api/ai/codex/connection")
      .then((res) => res.json())
      .then((data) => setConnected(Boolean(data.connected)));
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start sign-in.");
      setLogin(data);

      pollRef.current = setInterval(async () => {
        const pollRes = await fetch(`/api/ai/codex/connect/${data.loginId}`);
        const pollData = await pollRes.json();
        if (pollData.status === "connected") {
          stopPolling();
          setLogin(null);
          setConnected(true);
          toast.success("Codex subscription connected.");
        } else if (pollData.status === "failed" || pollData.status === "expired" || pollData.status === "not_found") {
          stopPolling();
          setLogin(null);
          toast.error(pollData.message ?? "Sign-in didn't complete. Try again.");
        }
      }, 2000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start sign-in.");
    } finally {
      setPending(false);
    }
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
            {connected === null ? "Checking…" : connected ? "Connected" : "Not connected"}
          </span>
        </CardContent>
        <CardFooter>
          {connected ? (
            <Button variant="outline" onClick={handleDisconnect} disabled={pending}>
              Disconnect
            </Button>
          ) : (
            <Button onClick={handleConnect} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Connect your Codex subscription
            </Button>
          )}
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

      <Dialog open={login !== null} onOpenChange={(open) => !open && setLogin(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in to ChatGPT</DialogTitle>
            <DialogDescription>
              Open the link below and enter the code to connect your subscription.
            </DialogDescription>
          </DialogHeader>
          {login ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <a
                href={login.verificationUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary underline underline-offset-4"
              >
                {login.verificationUrl}
              </a>
              <CodeChip code={login.userCode} />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Waiting for sign-in…
              </div>
            </div>
          ) : null}
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
