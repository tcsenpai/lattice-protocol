/**
 * Database Module
 * SQLite connection and migrations using better-sqlite3
 */

import Database from "better-sqlite3";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Initialize the database connection with WAL mode and foreign keys
 */
function createDatabase(dbPath: string): Database.Database {
  // Ensure data directory exists
  const dataDir = dirname(dbPath);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // Create database connection
  const db = new Database(dbPath);

  // Enable WAL mode for concurrent reads
  db.pragma("journal_mode = WAL");

  // Enable foreign keys
  db.pragma("foreign_keys = ON");

  return db;
}

/**
 * Run database migrations from schema.sql
 */
function runMigrations(db: Database.Database): void {
  const schemaPath = join(__dirname, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");

  // Execute schema (CREATE IF NOT EXISTS is idempotent)
  db.exec(schema);

  console.log("[db] Migrations complete");
}

/**
 * Get the singleton database instance
 */
let dbInstance: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    dbInstance = createDatabase(config.DATABASE_PATH);
    runMigrations(dbInstance);
    console.log(`[db] Connected to ${config.DATABASE_PATH}`);
  }
  return dbInstance;
}

/**
 * Close the database connection (for cleanup)
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    console.log("[db] Connection closed");
  }
}

// Initialize database when this module is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const db = getDatabase();
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )
    .all() as { name: string }[];
  console.log(
    "[db] Tables created:",
    tables.map((t) => t.name).join(", ")
  );
  closeDatabase();
}

export { Database };
