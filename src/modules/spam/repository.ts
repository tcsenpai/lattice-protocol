/**
 * Spam Repository
 * Database operations for spam detection and reporting
 */

import { getDatabase } from '../../db/index.js';
import { now } from '../../utils/time.js';
import { generateId } from '../../utils/ulid.js';
import { SIMHASH_CONFIG } from '../../types/index.js';
import type { SpamReport } from '../../types/index.js';

const SPAM_CONFIRM_THRESHOLD = 3;

/**
 * Get recent SimHashes for duplicate detection (24h window)
 * Used to check if new content is similar to existing posts
 *
 * @param authorDid - The DID of the author to check
 * @returns Array of simhash and postId pairs
 */
export function getRecentSimHashes(authorDid: string): Array<{ simhash: string; postId: string }> {
  const db = getDatabase();
  const windowStart = now() - (SIMHASH_CONFIG.WINDOW_HOURS * 3600);

  const stmt = db.prepare(`
    SELECT simhash, id as postId
    FROM posts
    WHERE author_did = ?
    AND created_at >= ?
    AND deleted = 0
  `);

  return stmt.all(authorDid, windowStart) as Array<{ simhash: string; postId: string }>;
}

/**
 * Create a spam report for a post
 *
 * @param postId - The ID of the post being reported
 * @param reporterDid - The DID of the reporter
 * @param reason - The reason for the report
 * @returns The created spam report
 * @throws Error if reporter has already reported this post
 */
export function createSpamReport(
  postId: string,
  reporterDid: string,
  reason: string
): SpamReport {
  const db = getDatabase();
  const id = generateId();
  const createdAt = now();

  const stmt = db.prepare(`
    INSERT INTO spam_reports (id, post_id, reporter_did, reason, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(id, postId, reporterDid, reason, createdAt);
  } catch (err: unknown) {
    if (err instanceof Error && err.message?.includes('UNIQUE constraint failed')) {
      throw new Error('Reporter has already reported this post');
    }
    throw err;
  }

  return {
    id,
    postId,
    reporterDid,
    reason,
    createdAt
  };
}

/**
 * Get spam reports for a post
 *
 * @param postId - The ID of the post
 * @returns Array of spam reports
 */
export function getSpamReportsForPost(postId: string): SpamReport[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, post_id as postId, reporter_did as reporterDid, reason, created_at as createdAt
    FROM spam_reports
    WHERE post_id = ?
    ORDER BY created_at DESC
  `);

  return stmt.all(postId) as SpamReport[];
}

/**
 * Count spam reports for a post
 *
 * @param postId - The ID of the post
 * @returns Number of reports
 */
export function countSpamReports(postId: string): number {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM spam_reports
    WHERE post_id = ?
  `);

  const result = stmt.get(postId) as { count: number };
  return result.count;
}

/**
 * Check if a user has already reported a post
 *
 * @param postId - The ID of the post
 * @param reporterDid - The DID of the reporter
 * @returns true if already reported
 */
export function hasUserReportedPost(postId: string, reporterDid: string): boolean {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT 1
    FROM spam_reports
    WHERE post_id = ?
    AND reporter_did = ?
    LIMIT 1
  `);

  return stmt.get(postId, reporterDid) !== undefined;
}

/**
 * Get posts with spam report counts above threshold
 * Used for moderation review
 *
 * @param minReports - Minimum number of reports
 * @param limit - Maximum results to return
 * @returns Array of post IDs with report counts
 */
export function getPostsWithHighReportCount(
  minReports: number,
  limit: number = 100
): Array<{ postId: string; reportCount: number }> {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT post_id as postId, COUNT(*) as reportCount
    FROM spam_reports
    GROUP BY post_id
    HAVING COUNT(*) >= ?
    ORDER BY reportCount DESC
    LIMIT ?
  `);

  return stmt.all(minReports, limit) as Array<{ postId: string; reportCount: number }>;
}

/**
 * Get the count of distinct reporters for a post
 *
 * @param postId - The ID of the post
 * @returns The number of distinct reporters
 */
export function getSpamReportCount(postId: string): number {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT COUNT(DISTINCT reporter_did) as count
    FROM spam_reports
    WHERE post_id = ?
  `);

  const row = stmt.get(postId) as { count: number };
  return row.count;
}

/**
 * Check if spam is confirmed (3+ distinct reporters)
 *
 * @param postId - The ID of the post
 * @returns True if spam is confirmed
 */
export function isSpamConfirmed(postId: string): boolean {
  return getSpamReportCount(postId) >= SPAM_CONFIRM_THRESHOLD;
}

/**
 * Check if a reporter has already reported a post
 * Alias for hasUserReportedPost for API consistency
 *
 * @param postId - The ID of the post
 * @param reporterDid - The DID of the reporter
 * @returns True if the reporter has already reported this post
 */
export function hasReported(postId: string, reporterDid: string): boolean {
  return hasUserReportedPost(postId, reporterDid);
}
