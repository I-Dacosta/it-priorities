"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { Thread } from "@/components/thread.aui";
import { codexAdapter } from "@/components/assistant/codex-adapter";

function useConnectionStatus() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/ai/codex/connection")
      .then((res) => res.json())
      .then((data) => {
        if (active) setConnected(Boolean(data.connected));
      })
      .catch(() => active && setConnected(false));
    return () => {
      active = false;
    };
  }, []);

  return connected;
}

export function ChatPanel() {
  const connected = useConnectionStatus();
  const runtime = useLocalRuntime(codexAdapter);

  if (connected === null) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!connected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-12 text-center">
        <h2 className="text-base font-medium text-foreground">Connect your Codex subscription</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          The assistant runs on your own ChatGPT/Codex subscription, so each person connects their
          own once in Settings.
        </p>
        <Button render={<Link href="/settings/assistant" />} nativeButton={false} className="mt-2">
          Go to Settings → Assistant
        </Button>
      </div>
    );
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border">
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  );
}
