import type { ReactNode } from "react";
import { NavLinks } from "@/components/shell/nav-links";
import { UserMenu } from "@/components/shell/user-menu";

export function AppShell({
  name,
  email,
  children,
}: {
  name: string;
  email: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                IT
              </span>
              <span className="font-semibold tracking-tight">Priorities</span>
            </div>
            <NavLinks />
          </div>
          <UserMenu name={name} email={email} />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
