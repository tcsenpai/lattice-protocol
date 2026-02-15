/**
 * Post Repository
 * Database operations for posts in the content module
 */

import { getDatabase } from "../../db/index.js";
import { now } from "../../utils/time.js";
import type { Post } from "../../types/index.js";

/**
 * Create a new post
 * Inserts with ULID, simhash, and timestamp
 */
export function createPost(post: {
  id: string;
  title?: string | null;
  excerpt?: string | null;
  content: string;
  contentType: "TEXT";
  parentId: string | null;
  authorDid: string;
  signature: string;
  simhash: string;
}): Post {
  const db = getDatabase();
  const createdAt = now();

  const stmt = db.prepare(`
    INSERT INTO posts (id, title, excerpt, content, content_type, parent_id, author_did, signature, simhash, created_at, deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  stmt.run(
    post.id,
    post.title || null,
    post.excerpt || null,
    post.content,
    post.contentType,
    post.parentId,
    post.authorDid,
    post.signature,
    post.simhash,
    createdAt
  );

  return {
    id: post.id,
    title: post.title || null,
    excerpt: post.excerpt || null,
    content: post.content,
    contentType: post.contentType,
    parentId: post.parentId,
    authorDid: post.authorDid,
    signature: post.signature,
    createdAt,
    editedAt: null,
    deleted: false,
    deletedAt: null,
    deletedReason: null,
    replyCount: 0,
    upvotes: 0,
    downvotes: 0,
    simhash: post.simhash,
  };
}

/**
 * Get post by ID
 * Returns null if not found
 */
export function getPost(id: string): Post | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT
      p.id, p.title, p.excerpt, p.content, p.content_type, p.parent_id, p.author_did,
      p.signature, p.created_at, p.edited_at, p.deleted, p.deleted_at, p.deleted_reason,
      p.simhash,
      COALESCE((SELECT COUNT(*) FROM posts WHERE parent_id = p.id), 0) as reply_count,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = 1), 0) as upvotes,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = -1), 0) as downvotes
    FROM posts p
    WHERE p.id = ?
  `);

  const row = stmt.get(id) as
    | {
        id: string;
        title: string | null;
        excerpt: string | null;
        content: string;
        content_type: string;
        parent_id: string | null;
        author_did: string;
        signature: string;
        created_at: number;
        edited_at: number | null;
        deleted: number;
        deleted_at: number | null;
        deleted_reason: string | null;
        simhash: string;
        reply_count: number;
        upvotes: number;
        downvotes: number;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    contentType: row.content_type as "TEXT",
    parentId: row.parent_id,
    authorDid: row.author_did,
    signature: row.signature,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deleted: Boolean(row.deleted),
    deletedAt: row.deleted_at,
    deletedReason: row.deleted_reason as "author" | "moderation" | null,
    replyCount: row.reply_count,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    simhash: row.simhash,
  };
}

/**
 * Soft delete a post
 * Sets deleted flag and records reason
 * Returns true if post was deleted, false if not found or already deleted
 */
export function softDelete(
  id: string,
  reason: "author" | "moderation"
): boolean {
  const db = getDatabase();
  const deletedAt = now();

  const stmt = db.prepare(`
    UPDATE posts
    SET deleted = 1, deleted_at = ?, deleted_reason = ?
    WHERE id = ?
    AND deleted = 0
  `);

  const result = stmt.run(deletedAt, reason, id);
  return result.changes > 0;
}

/**
 * Get reply count for a post
 * Only counts non-deleted replies
 */
export function getReplyCount(parentId: string): number {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM posts
    WHERE parent_id = ?
    AND deleted = 0
  `);

  const row = stmt.get(parentId) as { count: number };
  return row.count;
}

/**
 * Check if post exists
 * Returns true if post exists (regardless of deleted status)
 */
export function postExists(id: string): boolean {
  const db = getDatabase();

  const stmt = db.prepare("SELECT 1 FROM posts WHERE id = ?");
  return stmt.get(id) !== undefined;
}

/**
 * Update post content (edit)
 * Sets edited_at timestamp and updates content/title/excerpt
 * Returns true if post was updated
 */
export function updatePost(
  id: string,
  updates: {
    content: string;
    title?: string | null;
    excerpt?: string | null;
    simhash: string;
  }
): boolean {
  const db = getDatabase();
  const editedAt = now();

  const stmt = db.prepare(`
    UPDATE posts
    SET content = ?, title = ?, excerpt = ?, simhash = ?, edited_at = ?
    WHERE id = ?
    AND deleted = 0
  `);

  const result = stmt.run(
    updates.content,
    updates.title ?? null,
    updates.excerpt ?? null,
    updates.simhash,
    editedAt,
    id
  );
  return result.changes > 0;
}
