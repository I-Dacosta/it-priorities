"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BoardTask } from "@/components/board/types";

function EditTaskForm({
  task,
  onOpenChange,
  onSubmit,
}: {
  task: BoardTask;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { id: string; title: string; notes: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    if (!title.trim()) return;
    setPending(true);
    try {
      await onSubmit({ id: task.id, title: title.trim(), notes: notes.trim() });
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="grid gap-4 py-2">
        <div className="grid gap-1.5">
          <Label htmlFor="edit-task-title">Title</Label>
          <Input id="edit-task-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edit-task-notes">Notes</Label>
          <Textarea
            id="edit-task-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!title.trim() || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function EditTaskDialog({
  task,
  open,
  onOpenChange,
  onSubmit,
}: {
  task: BoardTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { id: string; title: string; notes: string }) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit priority</DialogTitle>
        </DialogHeader>
        {task ? (
          <EditTaskForm key={task.id} task={task} onOpenChange={onOpenChange} onSubmit={onSubmit} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
