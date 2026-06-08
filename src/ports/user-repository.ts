export interface UserRecord {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
}

export interface GroupRecord {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
}

export interface UserRepository {
  findOrCreateUser(email: string): Promise<{ user: UserRecord; group: GroupRecord }>;
  findGroupByUserId(userId: string): Promise<GroupRecord | null>;
}
