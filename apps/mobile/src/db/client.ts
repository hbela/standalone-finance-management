import { drizzle, type ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import * as SQLite from "expo-sqlite";

import { BOOTSTRAP_DDL } from "./bootstrap";
import * as schema from "./schema";

const DB_NAME = "wise-finance-mirror.db";

let dbInstance: ExpoSQLiteDatabase<typeof schema> | null = null;
let bootstrapPromise: Promise<void> | null = null;

export type MirrorDatabase = ExpoSQLiteDatabase<typeof schema>;

export function getMirrorDatabase(): MirrorDatabase {
  if (dbInstance) {
    return dbInstance;
  }
  const sqlite = SQLite.openDatabaseSync(DB_NAME);
  dbInstance = drizzle(sqlite, { schema });
  return dbInstance;
}

export async function ensureMirrorDatabaseReady(): Promise<MirrorDatabase> {
  const db = getMirrorDatabase();
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap(db);
  }
  await bootstrapPromise;
  return db;
}

async function bootstrap(db: MirrorDatabase) {
  // expo-sqlite executes multiple statements via execAsync.
  const sqlite = (db as unknown as { $client: SQLite.SQLiteDatabase }).$client;
  await sqlite.execAsync(BOOTSTRAP_DDL);
}

// Test-only helper to reset the singleton between cases.
export function __resetMirrorDatabaseForTests() {
  dbInstance = null;
  bootstrapPromise = null;
}
