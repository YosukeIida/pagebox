export interface UserStat {
  email: string;
  createdAt: Date;
  docCount: number;
  // そのユーザーが作った全バージョンの合計サイズ（= 実際に消費しているストレージ）
  totalSize: number;
}

export interface RecentDoc {
  slug: string;
  title: string;
  uploadedBy: string;
  createdAt: Date;
  size: number;
  latestVersion: number;
}

export interface AdminStats {
  userStats: UserStat[];
  recentDocs: RecentDoc[];
  totalDocCount: number;
  totalVersionCount: number;
  // 全バージョンの合計サイズ。バージョンは無制限に保持するため、
  // 最新版だけの合計では実際の R2 使用量と乖離する。
  totalSize: number;
}

export interface AdminRepository {
  getStats(): Promise<AdminStats>;
}
