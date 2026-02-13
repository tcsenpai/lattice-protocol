/**
 * Search Repository
 * FTS5 index management and maintenance
 */

import type Database from "better-sqlite3";
import { getDatabase } from "../../db/index.js";

/**
 * Rebuild the posts FTS index from existing posts table
 * Used for initial migration and maintenance
 */
export function rebuildPostsIndex(db?: Database.Database): number {
  const database = db ?? getDatabase();

  // Clear existing FTS index
  database.exec("DELETE FROM posts_fts");

  // Populate from posts table
  database.exec(`
    INSERT INTO posts_fts(id, content, author_did)
    SELECT id, content, author_did FROM posts WHERE deleted = 0
  `);

  // Get count of indexed posts
  const count = database
    .prepare("SELECT COUNT(*) as count FROM posts_fts")
    .get() as { count: number };

  console.log(`[search] Rebuilt FTS index with ${count.count} posts`);
  return count.count;
}

/**
 * Optimize the FTS5 index for better query performance
 * Should be run periodically (e.g., daily maintenance)
 */
export function optimizeFTSIndex(db?: Database.Database): void {
  const database = db ?? getDatabase();

  // FTS5 optimize command merges segments for better performance
  database.exec("INSERT INTO posts_fts(posts_fts) VALUES('optimize')");

  console.log("[search] FTS index optimized");
}

/**
 * Check if FTS index needs rebuilding
 * Returns true if posts table has more rows than FTS index
 */
export function needsRebuild(db?: Database.Database): boolean {
  const database = db ?? getDatabase();

  const postsCount = database
    .prepare("SELECT COUNT(*) as count FROM posts WHERE deleted = 0")
    .get() as { count: number };

  const ftsCount = database
    .prepare("SELECT COUNT(*) as count FROM posts_fts")
    .get() as { count: number };

  return postsCount.count !== ftsCount.count;
}
