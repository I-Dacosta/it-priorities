"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || "?";
}

export function UserMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="rounded-full outline-none ring-ring/50 transition focus-visible:ring-2" />
        }
      >
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary text-primary-foreground text-sm">
            {initials(name || email)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/*
          Deliberately not DropdownMenuLabel: that renders Base UI's
          Menu.GroupLabel, which throws ("MenuGroupContext is missing") unless
          it sits inside a Menu.Group. This is an account header rather than a
          label for a group of items, so it is plain markup carrying the same
          styles the label component would have applied.
        */}
        <div className="flex flex-col px-1.5 py-1 text-xs font-medium text-muted-foreground">
          <span className="font-medium">{name || email}</span>
          <span className="text-xs font-normal text-muted-foreground">{email}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings/assistant" />}>
          Assistant settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={async () => {
            await signOut();
            router.push("/sign-in");
            router.refresh();
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
