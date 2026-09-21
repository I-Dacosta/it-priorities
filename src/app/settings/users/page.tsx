import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/shell/app-shell";
import { UsersTable } from "@/components/users/users-table";

export default async function UsersPage() {
  const user = await requireUser();
  const users = await prisma.allowedUser.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, disabledAt: true, lastSignInAt: true },
  });

  return (
    <AppShell name={user.name ?? user.email} email={user.email}>
      <UsersTable users={users} currentUserId={user.id} />
    </AppShell>
  );
}
