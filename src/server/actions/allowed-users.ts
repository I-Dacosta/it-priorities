"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";

const addUserSchema = z.object({
  email: z.email().trim().toLowerCase(),
  name: z.string().trim().max(200).optional(),
});

export async function addAllowedUser(input: z.infer<typeof addUserSchema>) {
  const currentUser = await requireUser();
  const data = addUserSchema.parse(input);

  if (!data.email.endsWith("@aquatiq.com")) {
    throw new Error("Only @aquatiq.com email addresses can be added.");
  }

  await prisma.allowedUser.upsert({
    where: { email: data.email },
    update: { disabledAt: null },
    create: { email: data.email, name: data.name, addedById: currentUser.id },
  });

  revalidatePath("/settings/users");
}

export async function setUserDisabled(id: string, disabled: boolean) {
  const currentUser = await requireUser();

  if (id === currentUser.id && disabled) {
    throw new Error("You can't remove your own access.");
  }

  await prisma.allowedUser.update({
    where: { id },
    data: { disabledAt: disabled ? new Date() : null },
  });

  revalidatePath("/settings/users");
}

const preferredModelSchema = z.string().trim().max(200);

export async function updatePreferredCodexModel(model: string) {
  const currentUser = await requireUser();
  const parsed = preferredModelSchema.parse(model);

  await prisma.allowedUser.update({
    where: { id: currentUser.id },
    data: { preferredCodexModel: parsed || null },
  });

  revalidatePath("/settings/assistant");
}
