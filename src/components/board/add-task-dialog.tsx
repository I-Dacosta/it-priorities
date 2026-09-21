"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LANES } from "@/components/board/types";
import type { Owner } from "@/generated/prisma/client";

export function AddTaskDialog({
  owner,
  open,
  onOpenChange,
  onSubmit,
}: {
  owner: Owner | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { title: string; notes: string; owner: Owner }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  const laneLabel = LANES.find((l) => l.owner === owner)?.label ?? "";

  async function handleSubmit() {
    if (!owner || !title.trim()) return;
    setPending(true);
    try {
      await onSubmit({ title: title.trim(), notes: notes.trim(), owner });
      setTitle("");
      setNotes("");
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a priority for {laneLabel}</DialogTitle>
          <DialogDescription>
            It&apos;s added to the bottom of {laneLabel}&apos;s list — drag to reprioritize.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Ansattportal - Skytech"
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea
              id="task-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Status, next steps, context…"
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || pending}>
            {pending ? "Adding…" : "Add priority"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
