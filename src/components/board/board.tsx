"use client";

import { useRef, useState } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { move } from "@dnd-kit/helpers";
import { toast } from "sonner";
import { Lane } from "@/components/board/lane";
import { AddTaskDialog } from "@/components/board/add-task-dialog";
import { EditTaskDialog } from "@/components/board/edit-task-dialog";
import { createTask, deleteTask, reorderBoard, updateTask } from "@/server/actions/tasks";
import { LANES, type BoardTask } from "@/components/board/types";
import type { Owner } from "@/generated/prisma/client";

type LaneState = Record<Owner, string[]>;

function toLaneState(tasks: BoardTask[]): LaneState {
  const state = { ROBERT: [], IMA: [] } as LaneState;
  for (const task of [...tasks].sort((a, b) => a.position - b.position)) {
    state[task.owner].push(task.id);
  }
  return state;
}

export function Board({ initialTasks }: { initialTasks: BoardTask[] }) {
  const [tasksById, setTasksById] = useState<Map<string, BoardTask>>(() => {
    const map = new Map<string, BoardTask>();
    for (const task of initialTasks) map.set(task.id, task);
    return map;
  });
  const [lanes, setLanes] = useState<LaneState>(() => toLaneState(initialTasks));
  const [addingTo, setAddingTo] = useState<Owner | null>(null);
  const [editing, setEditing] = useState<BoardTask | null>(null);

  // setState updater functions must stay pure (no side effects, no calling
  // Server Actions inside them) — dnd-kit's onDragEnd needs the lanes value
  // right after a drag, so track it in a ref instead of reading react state.
  // Syncing during render (not an effect) is deliberate: onDragOver and
  // onDragEnd can both fire within the same tick, before an effect would run.
  const lanesRef = useRef(lanes);
  // eslint-disable-next-line react-hooks/refs
  lanesRef.current = lanes;
  const dragStartLanesRef = useRef<LaneState | null>(null);

  async function persistOrder(next: LaneState) {
    try {
      await reorderBoard(LANES.map(({ owner }) => ({ owner, orderedTaskIds: next[owner] })));
    } catch {
      toast.error("Couldn't save the new order. Refresh and try again.");
    }
  }

  async function handleAdd(values: { title: string; notes: string; owner: Owner }) {
    try {
      const task = await createTask(values);
      setTasksById((prev) => new Map(prev).set(task.id, task));
      setLanes((prev) => ({ ...prev, [values.owner]: [...prev[values.owner], task.id] }));
    } catch {
      toast.error("Couldn't add that priority. Try again.");
      throw new Error("add failed");
    }
  }

  async function handleSave(values: { id: string; title: string; notes: string }) {
    try {
      const task = await updateTask(values);
      setTasksById((prev) => new Map(prev).set(task.id, task));
    } catch {
      toast.error("Couldn't save changes. Try again.");
      throw new Error("save failed");
    }
  }

  async function handleDelete(task: BoardTask) {
    setLanes((prev) => ({
      ROBERT: prev.ROBERT.filter((id) => id !== task.id),
      IMA: prev.IMA.filter((id) => id !== task.id),
    }));
    try {
      await deleteTask(task.id);
      toast(`Deleted "${task.title}"`);
    } catch {
      toast.error("Couldn't delete that priority.");
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-foreground">IT priorities</h1>
        <p className="text-sm text-muted-foreground">
          Drag a card between lanes to reassign it, or up and down to reprioritize.
        </p>
      </div>
      <DragDropProvider
        onDragStart={() => {
          dragStartLanesRef.current = lanesRef.current;
        }}
        onDragOver={(event) => {
          setLanes((prev) => {
            const next = move(prev, event) as LaneState;
            // Assigning a ref during a setState updater is fine (unlike
            // calling another setter or an async action) — it keeps
            // lanesRef in sync immediately, before React re-renders, so
            // onDragEnd never reads a stale value if it fires in the same tick.
            lanesRef.current = next;
            return next;
          });
        }}
        onDragEnd={(event) => {
          if (event.canceled) {
            if (dragStartLanesRef.current) setLanes(dragStartLanesRef.current);
            return;
          }
          void persistOrder(lanesRef.current);
        }}
      >
        <div className="flex flex-1 flex-col gap-6 sm:flex-row">
          {LANES.map(({ owner, label }) => (
            <Lane
              key={owner}
              owner={owner}
              label={label}
              tasks={lanes[owner]
                .map((id) => tasksById.get(id))
                .filter((t): t is BoardTask => Boolean(t))}
              onAddTask={() => setAddingTo(owner)}
              onEditTask={setEditing}
              onDeleteTask={handleDelete}
            />
          ))}
        </div>
      </DragDropProvider>

      <AddTaskDialog
        owner={addingTo}
        open={addingTo !== null}
        onOpenChange={(open) => !open && setAddingTo(null)}
        onSubmit={handleAdd}
      />
      <EditTaskDialog
        task={editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={handleSave}
      />
    </div>
  );
}
