import { requireUser } from "@/lib/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { CodexConnectCard } from "@/components/assistant/codex-connect-card";

export default async function AssistantSettingsPage() {
  const user = await requireUser();

  return (
    <AppShell name={user.name ?? user.email} email={user.email}>
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-foreground">Assistant settings</h1>
          <p className="text-sm text-muted-foreground">Just for you — {user.email}</p>
        </div>
        <CodexConnectCard initialModel={user.preferredCodexModel} />
      </div>
    </AppShell>
  );
}
