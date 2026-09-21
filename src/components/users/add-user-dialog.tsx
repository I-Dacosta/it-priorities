"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addAllowedUser } from "@/server/actions/allowed-users";

export function AddUserDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setPending(true);
    try {
      await addAllowedUser({ email, name: name || undefined });
      setEmail("");
      setName("");
      setOpen(false);
      toast.success(`Added ${email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add that person.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Add teammate</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a teammate</DialogTitle>
          <DialogDescription>
            They&apos;ll be able to sign in with Microsoft using this email.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="new-user-email">Email</Label>
            <Input
              id="new-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="firstname.lastname@aquatiq.com"
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-user-name">Name (optional)</Label>
            <Input id="new-user-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!email.trim() || pending}>
            {pending ? "Adding…" : "Add teammate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
