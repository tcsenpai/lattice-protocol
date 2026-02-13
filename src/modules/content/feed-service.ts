/**
 * Feed Service - Cursor-based pagination for posts
 * Target: <200ms for 50 posts
 */

import { getDatabase } from "../../db/index.js";
import { calculateLevel } from "../exp/level-calculator.js";
import type { FeedQuery, FeedResponse, PostWithAuthor } from "../../types/index.js";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

interface PostRow {
  id: string;
  content: string;
  content_type: string;
  parent_id: string | null;
  author_did: string;
  signature: string;
  created_at: number;
  deleted: number;
  deleted_at: number | null;
  deleted_reason: string | null;
  simhash: string;
  reply_count: number;
  upvotes: number;
  downvotes: number;
  author_exp: number;
  author_username: string | null;
}

/**
 * Convert a database row to PostWithAuthor
 */
function rowToPostWithAuthor(row: PostRow): PostWithAuthor {
  return {
    id: row.id,
    content: row.content,
    contentType: row.content_type as "TEXT",
    parentId: row.parent_id,
    authorDid: row.author_did,
    signature: row.signature,
    createdAt: row.created_at,
    deleted: Boolean(row.deleted),
    deletedAt: row.deleted_at,
    deletedReason: row.deleted_reason as "author" | "moderation" | null,
    replyCount: row.reply_count,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    simhash: row.simhash,
    author: {
      did: row.author_did,
      username: row.author_username,
      level: calculateLevel(row.author_exp),
      totalEXP: row.author_exp,
    },
  };
}

/**
 * Get paginated feed of posts
 * Uses cursor-based pagination with ULID (lexicographically sortable)
 */
export function getFeed(query: FeedQuery): FeedResponse {
  const db = getDatabase();

  const limit = Math.min(query.limit || DEFAULT_LIMIT, MAX_LIMIT);
  const includeDeleted = query.includeDeleted ?? false;

  // Build query with conditions
  let sql = `
    SELECT
      p.id, p.content, p.content_type, p.parent_id, p.author_did,
      p.signature, p.created_at, p.deleted, p.deleted_at, p.deleted_reason,
      p.simhash,
      COALESCE((SELECT COUNT(*) FROM posts WHERE parent_id = p.id AND deleted = 0), 0) as reply_count,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = 1), 0) as upvotes,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = -1), 0) as downvotes,
      COALESCE(e.total, 0) as author_exp,
      a.username as author_username
    FROM posts p
    LEFT JOIN exp_balances e ON p.author_did = e.did
    LEFT JOIN agents a ON p.author_did = a.did
    WHERE 1=1
  `;

  const params: (string | number)[] = [];

  // Exclude deleted unless requested
  if (!includeDeleted) {
    sql += " AND p.deleted = 0";
  }

  // Filter by author if specified
  if (query.authorDid) {
    sql += " AND p.author_did = ?";
    params.push(query.authorDid);
  }

  // Filter top-level posts only (no replies in main feed)
  sql += " AND p.parent_id IS NULL";

  // Cursor pagination (ULID is lexicographically sortable)
  if (query.cursor) {
    sql += " AND p.id < ?";
    params.push(query.cursor);
  }

  // Sort by NEW (id desc = created_at desc due to ULID)
  sql += " ORDER BY p.id DESC";

  // Fetch one extra to check for more
  sql += " LIMIT ?";
  params.push(limit + 1);

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as PostRow[];

  const hasMore = rows.length > limit;
  const resultRows = rows.slice(0, limit);

  const posts: PostWithAuthor[] = resultRows.map(rowToPostWithAuthor);

  const nextCursor =
    hasMore && posts.length > 0 ? posts[posts.length - 1].id : null;

  return {
    posts,
    nextCursor,
    hasMore,
  };
}

/**
 * Get replies for a specific post
 * Uses cursor-based pagination
 */
export function getReplies(
  parentId: string,
  cursor: string | null,
  limit: number = DEFAULT_LIMIT
): FeedResponse {
  const db = getDatabase();

  const actualLimit = Math.min(limit, MAX_LIMIT);

  let sql = `
    SELECT
      p.id, p.content, p.content_type, p.parent_id, p.author_did,
      p.signature, p.created_at, p.deleted, p.deleted_at, p.deleted_reason,
      p.simhash,
      COALESCE((SELECT COUNT(*) FROM posts WHERE parent_id = p.id AND deleted = 0), 0) as reply_count,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = 1), 0) as upvotes,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = -1), 0) as downvotes,
      COALESCE(e.total, 0) as author_exp,
      a.username as author_username
    FROM posts p
    LEFT JOIN exp_balances e ON p.author_did = e.did
    LEFT JOIN agents a ON p.author_did = a.did
    WHERE p.parent_id = ?
    AND p.deleted = 0
  `;

  const params: (string | number)[] = [parentId];

  if (cursor) {
    sql += " AND p.id < ?";
    params.push(cursor);
  }

  sql += " ORDER BY p.id DESC LIMIT ?";
  params.push(actualLimit + 1);

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as PostRow[];

  const hasMore = rows.length > actualLimit;
  const resultRows = rows.slice(0, actualLimit);

  const posts: PostWithAuthor[] = resultRows.map(rowToPostWithAuthor);

  const nextCursor =
    hasMore && posts.length > 0 ? posts[posts.length - 1].id : null;

  return {
    posts,
    nextCursor,
    hasMore,
  };
}

/**
 * Get a single post by ID with author info
 */
export function getPostWithAuthor(postId: string): PostWithAuthor | null {
  const db = getDatabase();

  const sql = `
    SELECT
      p.id, p.content, p.content_type, p.parent_id, p.author_did,
      p.signature, p.created_at, p.deleted, p.deleted_at, p.deleted_reason,
      p.simhash,
      COALESCE((SELECT COUNT(*) FROM posts WHERE parent_id = p.id AND deleted = 0), 0) as reply_count,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = 1), 0) as upvotes,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = -1), 0) as downvotes,
      COALESCE(e.total, 0) as author_exp,
      a.username as author_username
    FROM posts p
    LEFT JOIN exp_balances e ON p.author_did = e.did
    LEFT JOIN agents a ON p.author_did = a.did
    WHERE p.id = ?
  `;

  const stmt = db.prepare(sql);
  const row = stmt.get(postId) as PostRow | undefined;

  if (!row) {
    return null;
  }

  return rowToPostWithAuthor(row);
}
