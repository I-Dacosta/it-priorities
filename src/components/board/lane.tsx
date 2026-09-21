"use client";

import { useDroppable } from "@dnd-kit/react";
import { AnimatePresence } from "motion/react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TaskCard } from "@/components/board/task-card";
import type { BoardTask } from "@/components/board/types";
import type { Owner } from "@/generated/prisma/client";

const LANE_STYLES: Record<Owner, { bg: string; fg: string }> = {
  ROBERT: { bg: "bg-lane-robert", fg: "text-lane-robert-foreground" },
  IMA: { bg: "bg-lane-ima", fg: "text-lane-ima-foreground" },
};

export function Lane({
  owner,
  label,
  tasks,
  onAddTask,
  onEditTask,
  onDeleteTask,
}: {
  owner: Owner;
  label: string;
  tasks: BoardTask[];
  onAddTask: () => void;
  onEditTask: (task: BoardTask) => void;
  onDeleteTask: (task: BoardTask) => void;
}) {
  const { ref, isDropTarget } = useDroppable({ id: owner });
  const style = LANE_STYLES[owner];

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div className={cn("flex items-center gap-2 rounded-full px-3 py-1", style.bg)}>
          <span className={cn("text-sm font-semibold", style.fg)}>{label}</span>
          <span className={cn("text-xs opacity-70", style.fg)}>{tasks.length}</span>
        </div>
        <Button variant="ghost" size="icon" className="size-7" onClick={onAddTask}>
          <Plus className="size-4" />
        </Button>
      </div>
      <div
        ref={ref}
        className={cn(
          "flex min-h-40 flex-1 flex-col gap-2.5 rounded-2xl border border-dashed bg-muted/40 p-2.5 transition-colors duration-150 ease-out",
          isDropTarget && "border-primary/50 bg-primary/5"
        )}
      >
        <AnimatePresence initial={false}>
          {tasks.map((task, index) => (
            <TaskCard
              key={task.id}
              task={task}
              index={index}
              onEdit={() => onEditTask(task)}
              onDelete={() => onDeleteTask(task)}
            />
          ))}
        </AnimatePresence>
        {tasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl py-8 text-center text-xs text-muted-foreground">
            Drop a priority here
          </div>
        ) : null}
      </div>
    </div>
  );
}
