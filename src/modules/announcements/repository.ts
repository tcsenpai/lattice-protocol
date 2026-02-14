/**
 * Announcements Repository
 * Database operations for server-wide announcements and pinned posts
 */

import { getDatabase } from '../../db/index.js';
import { now } from '../../utils/time.js';
import { ulid } from 'ulid';
import type { Announcement, PinnedPost } from '../../types/index.js';

interface AnnouncementRow {
  id: string;
  content: string;
  author_did: string;
  created_at: number;
  expires_at: number | null;
  active: number;
}

/**
 * Convert database row to Announcement object
 */
function rowToAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    content: row.content,
    authorDid: row.author_did,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    active: Boolean(row.active),
  };
}

/**
 * Create a new announcement
 * @param content - The announcement content
 * @param authorDid - The DID of the admin creating the announcement
 * @param expiresAt - Optional expiration timestamp (null for no expiration)
 * @returns The created Announcement object
 */
export function createAnnouncement(
  content: string,
  authorDid: string,
  expiresAt: number | null = null
): Announcement {
  const db = getDatabase();
  const id = ulid();
  const createdAt = now();

  const stmt = db.prepare(`
    INSERT INTO announcements (id, content, author_did, created_at, expires_at, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  stmt.run(id, content, authorDid, createdAt, expiresAt);

  return {
    id,
    content,
    authorDid,
    createdAt,
    expiresAt,
    active: true,
  };
}

/**
 * Get all active announcements (not expired)
 * @returns Array of active Announcement objects
 */
export function getActiveAnnouncements(): Announcement[] {
  const db = getDatabase();
  const currentTime = now();

  const stmt = db.prepare(`
    SELECT id, content, author_did, created_at, expires_at, active
    FROM announcements
    WHERE active = 1
    AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY created_at DESC
  `);

  const rows = stmt.all(currentTime) as AnnouncementRow[];
  return rows.map(rowToAnnouncement);
}

/**
 * Get a single announcement by ID
 * @param id - The announcement ID
 * @returns The Announcement object or null if not found
 */
export function getAnnouncement(id: string): Announcement | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, content, author_did, created_at, expires_at, active
    FROM announcements
    WHERE id = ?
  `);

  const row = stmt.get(id) as AnnouncementRow | undefined;
  if (!row) return null;

  return rowToAnnouncement(row);
}

/**
 * Deactivate an announcement
 * @param id - The announcement ID
 * @returns true if deactivated, false if not found
 */
export function deactivateAnnouncement(id: string): boolean {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE announcements
    SET active = 0
    WHERE id = ?
  `);

  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * Update an announcement's content
 * @param id - The announcement ID
 * @param content - New content
 * @param expiresAt - New expiration (undefined to keep current)
 * @returns The updated Announcement or null if not found
 */
export function updateAnnouncement(
  id: string,
  content: string,
  expiresAt?: number | null
): Announcement | null {
  const db = getDatabase();

  let sql = 'UPDATE announcements SET content = ?';
  const params: (string | number | null)[] = [content];

  if (expiresAt !== undefined) {
    sql += ', expires_at = ?';
    params.push(expiresAt);
  }

  sql += ' WHERE id = ?';
  params.push(id);

  const stmt = db.prepare(sql);
  const result = stmt.run(...params);

  if (result.changes === 0) {
    return null;
  }

  return getAnnouncement(id);
}

// =============================================================================
// Server-Wide Pinned Posts
// =============================================================================

interface PinnedPostRow {
  id: string;
  post_id: string;
  pinned_by: string;
  pinned_at: number;
  priority: number;
}

/**
 * Convert database row to PinnedPost object
 */
function rowToPinnedPost(row: PinnedPostRow): PinnedPost {
  return {
    id: row.id,
    postId: row.post_id,
    pinnedBy: row.pinned_by,
    pinnedAt: row.pinned_at,
    priority: row.priority,
  };
}

/**
 * Pin a post server-wide (admin only)
 * @param postId - The ID of the post to pin
 * @param pinnedBy - The DID of the admin pinning the post
 * @param priority - Priority level (higher = more important)
 * @returns The created PinnedPost object
 */
export function pinPostServerWide(
  postId: string,
  pinnedBy: string,
  priority: number = 0
): PinnedPost {
  const db = getDatabase();
  const id = ulid();
  const pinnedAt = now();

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO pinned_posts (id, post_id, pinned_by, pinned_at, priority)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(id, postId, pinnedBy, pinnedAt, priority);

  return {
    id,
    postId,
    pinnedBy,
    pinnedAt,
    priority,
  };
}

/**
 * Unpin a post from server-wide pinned posts
 * @param postId - The ID of the post to unpin
 * @returns true if unpinned, false if not found
 */
export function unpinPostServerWide(postId: string): boolean {
  const db = getDatabase();

  const stmt = db.prepare(`
    DELETE FROM pinned_posts
    WHERE post_id = ?
  `);

  const result = stmt.run(postId);
  return result.changes > 0;
}

/**
 * Get all server-wide pinned posts
 * @returns Array of PinnedPost objects, sorted by priority (desc) then pinned_at (desc)
 */
export function getServerPinnedPosts(): PinnedPost[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, post_id, pinned_by, pinned_at, priority
    FROM pinned_posts
    ORDER BY priority DESC, pinned_at DESC
  `);

  const rows = stmt.all() as PinnedPostRow[];
  return rows.map(rowToPinnedPost);
}

/**
 * Get server-wide pinned post IDs
 * @returns Array of post IDs that are pinned
 */
export function getServerPinnedPostIds(): string[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT post_id
    FROM pinned_posts
    ORDER BY priority DESC, pinned_at DESC
  `);

  const rows = stmt.all() as { post_id: string }[];
  return rows.map(row => row.post_id);
}

/**
 * Check if a post is pinned server-wide
 * @param postId - The post ID to check
 * @returns true if pinned, false otherwise
 */
export function isPostPinnedServerWide(postId: string): boolean {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT 1 FROM pinned_posts WHERE post_id = ?
  `);

  return stmt.get(postId) !== undefined;
}

/**
 * Update a pinned post's priority
 * @param postId - The post ID
 * @param priority - New priority value
 * @returns true if updated, false if not found
 */
export function updatePinnedPostPriority(postId: string, priority: number): boolean {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE pinned_posts
    SET priority = ?
    WHERE post_id = ?
  `);

  const result = stmt.run(priority, postId);
  return result.changes > 0;
}
