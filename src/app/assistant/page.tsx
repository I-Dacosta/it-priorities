import { requireUser } from "@/lib/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { ChatPanel } from "@/components/assistant/chat-panel";

export default async function AssistantPage() {
  const user = await requireUser();

  return (
    <AppShell name={user.name ?? user.email} email={user.email}>
      <div className="flex flex-1 flex-col">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-foreground">Assistant</h1>
          <p className="text-sm text-muted-foreground">
            Ask about the board, draft a status update, or think through a priority.
          </p>
        </div>
        <ChatPanel />
      </div>
    </AppShell>
  );
}
