import type { AnalyticsPort } from "../../ports/analytics";

interface AnalyticsDataset {
  writeDataPoint(data: {
    blobs?: string[];
    doubles?: number[];
    indexes?: string[];
  }): void;
}

export function createCloudflareAnalytics(dataset: AnalyticsDataset): AnalyticsPort {
  return {
    recordView(slug, meta) {
      dataset.writeDataPoint({
        blobs: ["view", slug, meta.country ?? "", meta.referer ?? ""],
        doubles: [meta.responseTimeMs ?? 0],
        indexes: [slug],
      });
    },
    recordUpload(slug, meta) {
      dataset.writeDataPoint({
        blobs: ["upload", slug, meta.userEmail],
        doubles: [meta.fileSizeBytes],
        indexes: [slug],
      });
    },
  };
}
