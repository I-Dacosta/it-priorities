import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/shell/app-shell";
import { Board } from "@/components/board/board";

export default async function BoardPage() {
  const user = await requireUser();
  const tasks = await prisma.task.findMany({
    orderBy: { position: "asc" },
    select: { id: true, title: true, notes: true, owner: true, position: true },
  });

  return (
    <AppShell name={user.name ?? user.email} email={user.email}>
      <Board initialTasks={tasks} />
    </AppShell>
  );
}
