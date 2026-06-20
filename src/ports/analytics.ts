export interface AnalyticsPort {
  recordView(slug: string, meta: {
    country?: string;
    referer?: string;
    responseTimeMs?: number;
  }): void;
  recordUpload(slug: string, meta: {
    userEmail: string;
    fileSizeBytes: number;
  }): void;
}
