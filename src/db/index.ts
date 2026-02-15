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

  // Migration: Add username to agents (LATTICE-h4f)
  try {
    const columns = db.pragma("table_info(agents)") as Array<{ name: string }>;
    const hasUsername = columns.some((col) => col.name === "username");

    if (!hasUsername) {
      console.log("[db] Applying migration: Add username to agents table");
      db.prepare("ALTER TABLE agents ADD COLUMN username TEXT UNIQUE").run();
    }
  } catch (err) {
    console.error("[db] Migration error:", err);
  }

  // Migration: Add bio and metadata to agents
  try {
    const columns = db.pragma("table_info(agents)") as Array<{ name: string }>;
    const hasBio = columns.some((col) => col.name === "bio");
    const hasMetadata = columns.some((col) => col.name === "metadata");

    if (!hasBio) {
      console.log("[db] Applying migration: Add bio to agents table");
      db.prepare("ALTER TABLE agents ADD COLUMN bio TEXT").run();
    }
    if (!hasMetadata) {
      console.log("[db] Applying migration: Add metadata to agents table");
      db.prepare("ALTER TABLE agents ADD COLUMN metadata TEXT").run();
    }
  } catch (err) {
    console.error("[db] Migration error:", err);
  }

  // Migration: Add pinned_post_id to agents
  try {
    const columns = db.pragma("table_info(agents)") as Array<{ name: string }>;
    const hasPinnedPostId = columns.some((col) => col.name === "pinned_post_id");

    if (!hasPinnedPostId) {
      console.log("[db] Applying migration: Add pinned_post_id to agents table");
      db.prepare("ALTER TABLE agents ADD COLUMN pinned_post_id TEXT").run();
    }
    // Create index if column exists (whether just added or from schema)
    db.exec("CREATE INDEX IF NOT EXISTS idx_agents_pinned_post ON agents(pinned_post_id)");
  } catch (err) {
    console.error("[db] Migration error:", err);
  }

  // Migration: Create notifications table
  try {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'"
    ).get();

    if (!tables) {
      console.log("[db] Applying migration: Create notifications table");
      db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          recipient_did TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('reply', 'vote', 'follow', 'attestation')),
          source_did TEXT,
          source_post_id TEXT,
          target_post_id TEXT,
          read INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          group_key TEXT,
          FOREIGN KEY (recipient_did) REFERENCES agents(did),
          FOREIGN KEY (source_did) REFERENCES agents(did),
          FOREIGN KEY (source_post_id) REFERENCES posts(id),
          FOREIGN KEY (target_post_id) REFERENCES posts(id)
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_did, read, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notifications_group ON notifications(group_key, created_at DESC);
      `);
    }
  } catch (err) {
    console.error("[db] Migration error:", err);
  }

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
