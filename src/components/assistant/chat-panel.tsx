"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { Thread } from "@/components/thread.aui";
import { codexAdapter } from "@/components/assistant/codex-adapter";

type Status = { connected: boolean; configured: boolean } | null;

function useConnectionStatus(): Status {
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/ai/codex/connection")
      .then((res) => res.json())
      .then((data) => {
        if (active) {
          setStatus({ connected: Boolean(data.connected), configured: data.configured !== false });
        }
      })
      .catch(() => active && setStatus({ connected: false, configured: true }));
    return () => {
      active = false;
    };
  }, []);

  return status;
}

function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-12 text-center">
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      <div className="max-w-sm text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export function ChatPanel() {
  const status = useConnectionStatus();
  const runtime = useLocalRuntime(codexAdapter);

  if (status === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!status.configured) {
    return (
      <EmptyState title="Assistant not available here">
        <p>
          The assistant runs each person&apos;s own Codex subscription through the codex-bridge
          service, which needs a persistent host. This deployment doesn&apos;t have one configured.
        </p>
      </EmptyState>
    );
  }

  if (!status.connected) {
    return (
      <EmptyState title="Connect your Codex subscription">
        <p>
          The assistant runs on your own ChatGPT/Codex subscription, so each person connects their
          own once in Settings.
        </p>
        <Button
          render={<Link href="/settings/assistant" />}
          nativeButton={false}
          className="mt-4"
        >
          Go to Settings → Assistant
        </Button>
      </EmptyState>
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
