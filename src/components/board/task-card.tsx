"use client";

import { useSortable } from "@dnd-kit/react/sortable";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { BoardTask } from "@/components/board/types";

export function TaskCard({
  task,
  index,
  onEdit,
  onDelete,
}: {
  task: BoardTask;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { ref, isDragging } = useSortable({ id: task.id, index });

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: isDragging ? 0.6 : 1, scale: isDragging ? 1.02 : 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.16, ease: [0, 0, 0.2, 1] }}
      className={cn(
        "group rounded-xl border bg-card p-4 shadow-sm transition-shadow duration-150",
        isDragging && "shadow-lg"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium leading-snug text-foreground">{task.title}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {task.notes ? (
        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {task.notes}
        </p>
      ) : null}
    </motion.div>
  );
}
