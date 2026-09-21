"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";

/** Makes every motion.* animation in the app honor prefers-reduced-motion. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
