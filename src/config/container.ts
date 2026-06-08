import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Hono } from "hono";
import { createDb } from "../db/client";
import { createDrizzleRepository } from "../adapters/repository/drizzle";
import { createDrizzleUserRepository } from "../adapters/repository/drizzle-user";
import { createFsStorage } from "../adapters/storage/fs";
import { createDevAuth } from "../adapters/auth/dev";
import { createApp } from "../http/app";

export interface AppConfig {
  port: number;
  dataDir: string;
  dbPath: string;
  storageDir: string;
  storageDriver: string;
  dbDriver: string;
  devEmail: string;
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const dataDir = env.PAGEBOX_DATA_DIR ?? "./data";
  return {
    port: Number(env.PORT ?? 3000),
    dataDir,
    dbPath: env.PAGEBOX_DB_PATH ?? `${dataDir}/pagebox.db`,
    storageDir: env.PAGEBOX_STORAGE_DIR ?? `${dataDir}/blobs`,
    storageDriver: env.STORAGE_DRIVER ?? "fs",
    dbDriver: env.DB_DRIVER ?? "sqlite",
    devEmail: env.PAGEBOX_DEV_EMAIL ?? "dev@localhost",
  };
}

export function createContainer(config: AppConfig): { app: Hono; config: AppConfig } {
  mkdirSync(dirname(resolve(config.dbPath)), { recursive: true });
  const db = createDb(config.dbPath);
  const repo = createDrizzleRepository(db);
  const userRepo = createDrizzleUserRepository(db);

  let storage;
  switch (config.storageDriver) {
    case "fs":
      storage = createFsStorage(config.storageDir);
      break;
    default:
      throw new Error(`未対応の STORAGE_DRIVER: ${config.storageDriver}`);
  }

  const auth = createDevAuth(config.devEmail);
  const app = createApp({ storage, repo, auth, userRepo });

  return { app, config };
}
