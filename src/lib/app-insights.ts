import { ApplicationInsights } from "@microsoft/applicationinsights-web";

let instance: ApplicationInsights | null = null;

/** No-op (returns null) when NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING isn't set. */
export function getAppInsights(): ApplicationInsights | null {
  const connectionString = process.env.NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING;
  if (!connectionString) return null;

  if (!instance) {
    instance = new ApplicationInsights({
      config: {
        connectionString,
        enableAutoRouteTracking: true,
        enableCorsCorrelation: true,
        distributedTracingMode: 2, // AI_AND_W3C
        autoTrackPageVisitTime: true,
      },
    });
    instance.loadAppInsights();
  }
  return instance;
}
