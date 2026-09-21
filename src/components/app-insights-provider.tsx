"use client";

import { useEffect } from "react";
import { getAppInsights } from "@/lib/app-insights";

/** Boots App Insights once on the client. Renders nothing. */
export function AppInsightsProvider() {
  useEffect(() => {
    getAppInsights();
  }, []);

  return null;
}
