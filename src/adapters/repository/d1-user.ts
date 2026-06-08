import type { D1Db } from "./d1";
import type { UserRepository, UserRecord, GroupRecord } from "../../ports/user-repository";
import { nanoid } from "../../core/ids";

type UserRow = { id: string; email: string; display_name: string | null; created_at: number };
type GroupRow = { id: string; name: string; owner_id: string; created_at: number };

function rowToUser(row: UserRow): UserRecord {
  return { id: row.id, email: row.email, displayName: row.display_name, createdAt: new Date(row.created_at) };
}
function rowToGroup(row: GroupRow): GroupRecord {
  return { id: row.id, name: row.name, ownerId: row.owner_id, createdAt: new Date(row.created_at) };
}

export function createD1UserRepository(db: D1Db): UserRepository {
  return {
    async findOrCreateUser(email: string): Promise<{ user: UserRecord; group: GroupRecord }> {
      const existingUser = await db
        .prepare(`SELECT * FROM users WHERE email = ?`)
        .bind(email)
        .first<UserRow>();

      if (existingUser) {
        const groupRow = await db
          .prepare(`SELECT * FROM groups WHERE owner_id = ?`)
          .bind(existingUser.id)
          .first<GroupRow>();
        return { user: rowToUser(existingUser), group: rowToGroup(groupRow!) };
      }

      const now = Date.now();
      const userId = nanoid(12);
      const groupId = nanoid(12);
      const displayName = email.split("@")[0];
      const groupName = `${displayName}'s space`;

      await db.batch([
        db.prepare(`INSERT INTO users (id, email, display_name, created_at) VALUES (?, ?, ?, ?)`)
          .bind(userId, email, displayName, now),
        db.prepare(`INSERT INTO groups (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)`)
          .bind(groupId, groupName, userId, now),
        db.prepare(`INSERT INTO user_groups (user_id, group_id, role, joined_at) VALUES (?, ?, 'owner', ?)`)
          .bind(userId, groupId, now),
      ]);

      return {
        user: { id: userId, email, displayName, createdAt: new Date(now) },
        group: { id: groupId, name: groupName, ownerId: userId, createdAt: new Date(now) },
      };
    },

    async findGroupByUserId(userId: string): Promise<GroupRecord | null> {
      const row = await db
        .prepare(`SELECT * FROM groups WHERE owner_id = ?`)
        .bind(userId)
        .first<GroupRow>();
      return row ? rowToGroup(row) : null;
    },
  };
}
