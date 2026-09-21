"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddUserDialog } from "@/components/users/add-user-dialog";
import { setUserDisabled } from "@/server/actions/allowed-users";
import { cn } from "@/lib/utils";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  disabledAt: Date | null;
  lastSignInAt: Date | null;
};

function initials(label: string) {
  const parts = label.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || "?";
}

export function UsersTable({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(user: UserRow) {
    const disable = !user.disabledAt;
    if (disable && user.id === currentUserId) {
      toast.error("You can't remove your own access.");
      return;
    }
    setPendingId(user.id);
    startTransition(async () => {
      try {
        await setUserDisabled(user.id, disable);
        toast.success(disable ? `Removed ${user.email}` : `Restored ${user.email}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't update that person.");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground">
            Anyone here can sign in with Microsoft and edit the board.
          </p>
        </div>
        <AddUserDialog />
      </div>

      <div className="overflow-hidden rounded-2xl border">
        {users.map((user) => (
          <div
            key={user.id}
            className={cn(
              "flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0",
              user.disabledAt && "opacity-50"
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="size-8">
                <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                  {initials(user.name || user.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">
                  {user.name || user.email}
                  {user.id === currentUserId && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {user.disabledAt ? (
                <Badge variant="secondary">Removed</Badge>
              ) : user.lastSignInAt ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Signed in
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Not signed in yet
                </Badge>
              )}
              <Button
                variant={user.disabledAt ? "outline" : "ghost"}
                size="sm"
                disabled={pendingId === user.id}
                onClick={() => toggle(user)}
              >
                {user.disabledAt ? "Restore" : "Remove"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
