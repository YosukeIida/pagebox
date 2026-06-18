import type { AnalyticsPort } from "../../ports/analytics";

export function createNoopAnalytics(): AnalyticsPort {
  return {
    recordView() {},
    recordUpload() {},
  };
}
