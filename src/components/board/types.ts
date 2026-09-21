import type { Owner } from "@/generated/prisma/client";

export type BoardTask = {
  id: string;
  title: string;
  notes: string;
  owner: Owner;
  position: number;
};

export const LANES: { owner: Owner; label: string }[] = [
  { owner: "ROBERT", label: "Robert" },
  { owner: "IMA", label: "Ima" },
];
