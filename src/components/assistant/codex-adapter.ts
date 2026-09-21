import type { ChatModelAdapter } from "@assistant-ui/react";

function extractText(content: readonly { type: string; text?: string }[]): string {
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

export const codexAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages.map((message) => ({
          role: message.role,
          content: extractText(message.content),
        })),
      }),
      signal: abortSignal,
    });

    if (!response.ok || !response.body) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? "The assistant couldn't respond.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (!line.trim()) continue;

        const event = JSON.parse(line) as { type: string; text?: string; message?: string };
        if (event.type === "delta" && event.text) {
          text += event.text;
          yield { content: [{ type: "text", text }] };
        } else if (event.type === "error") {
          throw new Error(event.message ?? "The assistant couldn't respond.");
        }
      }
    }
  },
};
