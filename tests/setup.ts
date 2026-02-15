/**
 * Test setup file
 * Creates an isolated test database for each test run
 */

import { beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let testDb: Database.Database | null = null;

/**
 * Initialize test database with schema
 */
export function getTestDatabase(): Database.Database {
  if (!testDb) {
    testDb = new Database(':memory:');
    const schema = readFileSync(join(__dirname, '../src/db/schema.sql'), 'utf-8');
    testDb.exec(schema);
  }
  return testDb;
}

/**
 * Close test database
 */
export function closeTestDatabase(): void {
  if (testDb) {
    testDb.close();
    testDb = null;
  }
}

/**
 * Clear all tables (for test isolation)
 */
export function clearTestDatabase(): void {
  const db = getTestDatabase();
  const tables = [
    'pinned_posts',
    'announcements',
    'post_topics',
    'topics',
    'follows',
    'spam_reports',
    'votes',
    'posts',
    'rate_limits',
    'exp_deltas',
    'exp_balances',
    'attestations',
    'agents',
  ];

  for (const table of tables) {
    db.exec(`DELETE FROM ${table}`);
  }
}
