import fs from "fs";
import path from "path";
import type { Database } from "./types";

const dataDir = path.join(process.cwd(), "data");
export const dbPath = path.join(dataDir, "db.json");

let database: Database;

function persist() {
  fs.mkdirSync(dataDir, { recursive: true });
  const temporary = `${dbPath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(database, null, 2));
  fs.renameSync(temporary, dbPath);
}

export function getDb() {
  return database;
}

export function initDatabase(seed: () => Database) {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    database = seed();
    persist();
    return;
  }

  database = JSON.parse(fs.readFileSync(dbPath, "utf8")) as Database;
  if (database.version !== 1) {
    database = seed();
    persist();
  }
}

export function writeDatabase(next: Database) {
  database = next;
  persist();
}

export function save() {
  persist();
}

export function update<T>(fn: (db: Database) => T): T {
  const snapshot = JSON.parse(JSON.stringify(database)) as Database;
  try {
    const result = fn(database);
    persist();
    return result;
  } catch (error) {
    database = snapshot;
    throw error;
  }
}
