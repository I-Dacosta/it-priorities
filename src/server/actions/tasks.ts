"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { Owner } from "@/generated/prisma/client";

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(4000).optional().default(""),
  owner: z.enum(Owner),
});

export async function createTask(input: z.infer<typeof createTaskSchema>) {
  const user = await requireUser();
  const data = createTaskSchema.parse(input);

  const count = await prisma.task.count({ where: { owner: data.owner } });
  const task = await prisma.task.create({
    data: {
      title: data.title,
      notes: data.notes,
      owner: data.owner,
      position: count,
      createdById: user.id,
    },
  });

  revalidatePath("/");
  return task;
}

const updateTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(4000).optional().default(""),
});

export async function updateTask(input: z.infer<typeof updateTaskSchema>) {
  const user = await requireUser();
  const data = updateTaskSchema.parse(input);

  const task = await prisma.task.update({
    where: { id: data.id },
    data: { title: data.title, notes: data.notes, updatedById: user.id },
  });

  revalidatePath("/");
  return task;
}

export async function deleteTask(id: string) {
  await requireUser();
  await prisma.task.delete({ where: { id } });
  revalidatePath("/");
}

const reorderBoardSchema = z.array(
  z.object({
    owner: z.enum(Owner),
    orderedTaskIds: z.array(z.string().min(1)),
  })
);

/**
 * Renumbers the affected lane(s) 0..n-1 in one transaction. At this app's
 * scale (a handful to a few dozen cards) a full renumber on every drag is
 * simpler and always correct, since the client always sends the complete
 * new order for any lane it touched — no fractional-index/gap math needed.
 */
export async function reorderBoard(changes: z.infer<typeof reorderBoardSchema>) {
  const user = await requireUser();
  const parsed = reorderBoardSchema.parse(changes);

  await prisma.$transaction(
    parsed.flatMap(({ owner, orderedTaskIds }) =>
      orderedTaskIds.map((id, position) =>
        prisma.task.update({
          where: { id },
          data: { owner, position, updatedById: user.id },
        })
      )
    )
  );

  // Deliberately no revalidatePath here. This fires on every drop, and "/" is
  // a dynamic route whose Board seeds its state from a lazy useState
  // initializer — so revalidating re-renders the whole page server-side and
  // ships an RSC payload the client then throws away. That round trip on each
  // drag is what made reordering feel unresponsive. The board already holds
  // the authoritative order locally, and a fresh navigation re-reads the
  // database anyway.
}
