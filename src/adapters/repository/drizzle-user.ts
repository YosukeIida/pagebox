import { eq } from "drizzle-orm";
import type { DB } from "../../db/client";
import { users, groups, userGroups } from "../../db/schema";
import type { UserRepository, UserRecord, GroupRecord } from "../../ports/user-repository";
import { nanoid } from "../../core/ids";

type UserRow = typeof users.$inferSelect;
type GroupRow = typeof groups.$inferSelect;

function rowToUser(row: UserRow): UserRecord {
  return { id: row.id, email: row.email, displayName: row.displayName, createdAt: row.createdAt };
}

function rowToGroup(row: GroupRow): GroupRecord {
  return { id: row.id, name: row.name, ownerId: row.ownerId, createdAt: row.createdAt };
}

export function createDrizzleUserRepository(db: DB): UserRepository {
  return {
    async findOrCreateUser(email: string): Promise<{ user: UserRecord; group: GroupRecord }> {
      const existingUser = await db.select().from(users).where(eq(users.email, email)).get();
      if (existingUser) {
        const groupRow = await db.select().from(groups).where(eq(groups.ownerId, existingUser.id)).get();
        return { user: rowToUser(existingUser), group: rowToGroup(groupRow!) };
      }
      const now = new Date();
      const userId = nanoid(12);
      const groupId = nanoid(12);
      const displayName = email.split("@")[0];
      const groupName = `${displayName}'s space`;
      await db.insert(users).values({ id: userId, email, displayName, createdAt: now });
      await db.insert(groups).values({ id: groupId, name: groupName, ownerId: userId, createdAt: now });
      await db.insert(userGroups).values({ userId, groupId, role: "owner", joinedAt: now });
      return {
        user: { id: userId, email, displayName, createdAt: now },
        group: { id: groupId, name: groupName, ownerId: userId, createdAt: now },
      };
    },

    async findGroupByUserId(userId: string): Promise<GroupRecord | null> {
      const row = await db.select().from(groups).where(eq(groups.ownerId, userId)).get();
      return row ? rowToGroup(row) : null;
    },
  };
}
