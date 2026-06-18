export interface UserStat {
  email: string;
  createdAt: Date;
  docCount: number;
  totalSize: number;
}

export interface RecentDoc {
  slug: string;
  title: string;
  uploadedBy: string;
  createdAt: Date;
  size: number;
}

export interface AdminStats {
  userStats: UserStat[];
  recentDocs: RecentDoc[];
  totalDocCount: number;
  totalSize: number;
}

export interface AdminRepository {
  getStats(): Promise<AdminStats>;
}
